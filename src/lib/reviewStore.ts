import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * Pool of missed + manually-saved words.
 * Guest: in-memory only — closing or refreshing the tab clears it (by design).
 * Signed in: mirrored to the Supabase `missed_words` table (see supabase/schema.sql),
 * merged with the local pool on login. Remote failures degrade to local-only.
 */

interface Entry {
  wrongCount: number;
  /** Bookmarked via Space during a session, independent of wrongCount. */
  saved: boolean;
}

export interface ReviewPool {
  count: number;
  ids: ReadonlySet<string>;
  wrongCountOf: (id: string) => number;
  isSaved: (id: string) => boolean;
}

/**
 * All-time wrong-answer history. Grows whenever a word is missed and is
 * never touched by mastery, "clear wrong/saved", or "clear all" — only an
 * explicit history-clear removes an entry. Backed by the separate
 * `word_history` table so it survives the active pool being reset.
 */
export interface HistoryPool {
  count: number;
  ids: ReadonlySet<string>;
  wrongCountOf: (id: string) => number;
}

const misses = new Map<string, Entry>();
const history = new Map<string, number>();
const listeners = new Set<() => void>();
const historyListeners = new Set<() => void>();
let activeUserId: string | null = null;
let remoteWarned = false;
let historyRemoteWarned = false;
let snapshot: ReviewPool = buildSnapshot();
let historySnapshot: HistoryPool = buildHistorySnapshot();

function buildSnapshot(): ReviewPool {
  const frozen = new Map(misses);
  return {
    count: frozen.size,
    ids: new Set(frozen.keys()),
    wrongCountOf: (id) => frozen.get(id)?.wrongCount ?? 0,
    isSaved: (id) => frozen.get(id)?.saved ?? false,
  };
}

function buildHistorySnapshot(): HistoryPool {
  const frozen = new Map(history);
  return {
    count: frozen.size,
    ids: new Set(frozen.keys()),
    wrongCountOf: (id) => frozen.get(id) ?? 0,
  };
}

function notify() {
  snapshot = buildSnapshot();
  listeners.forEach((fn) => fn());
}

function notifyHistory() {
  historySnapshot = buildHistorySnapshot();
  historyListeners.forEach((fn) => fn());
}

function warnRemote(err: unknown) {
  if (remoteWarned) return;
  remoteWarned = true;
  console.warn(
    "[TypeSee] 복습 단어 DB 동기화 실패 — 로컬 메모리로만 동작합니다. " +
      "v2/supabase/schema.sql 이 실행되었는지 확인하세요.",
    err,
  );
}

function warnHistoryRemote(err: unknown) {
  if (historyRemoteWarned) return;
  historyRemoteWarned = true;
  console.warn(
    "[TypeSee] 역대 오답 기록 DB 동기화 실패 — 로컬 메모리로만 동작합니다. " +
      "v2/supabase/schema.sql 이 실행되었는지 확인하세요.",
    err,
  );
}

export function useReviewPool(): ReviewPool {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
    () => snapshot, // SSR: 초기(빈) 풀
  );
}

export function useHistoryPool(): HistoryPool {
  return useSyncExternalStore(
    (fn) => {
      historyListeners.add(fn);
      return () => historyListeners.delete(fn);
    },
    () => historySnapshot,
    () => historySnapshot,
  );
}

export function recordSession(
  missed: Array<{ id: string; count: number }>,
  mastered: string[],
) {
  if (missed.length === 0 && mastered.length === 0) return;

  for (const { id, count } of missed) {
    const cur = misses.get(id);
    misses.set(id, { wrongCount: (cur?.wrongCount ?? 0) + count, saved: cur?.saved ?? false });
    history.set(id, (history.get(id) ?? 0) + count);
  }
  // A saved (bookmarked) word stays in the pool even once mastered — only
  // its miss-driven presence is cleared. History is untouched either way.
  for (const id of mastered) {
    const cur = misses.get(id);
    if (cur?.saved) misses.set(id, { wrongCount: 0, saved: true });
    else misses.delete(id);
  }
  notify();
  if (missed.length > 0) notifyHistory();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const uid = activeUserId;

  if (missed.length > 0) {
    const rows = missed.map(({ id }) => ({
      user_id: uid,
      word_id: id,
      wrong_count: misses.get(id)?.wrongCount ?? 1,
      saved: misses.get(id)?.saved ?? false,
      last_missed_at: new Date().toISOString(),
    }));
    sb.from("missed_words")
      .upsert(rows, { onConflict: "user_id,word_id" })
      .then(({ error }) => error && warnRemote(error));

    const historyRows = missed.map(({ id }) => ({
      user_id: uid,
      word_id: id,
      wrong_count: history.get(id) ?? 1,
      last_missed_at: new Date().toISOString(),
    }));
    sb.from("word_history")
      .upsert(historyRows, { onConflict: "user_id,word_id" })
      .then(({ error }) => error && warnHistoryRemote(error));
  }
  const deleted = mastered.filter((id) => !misses.has(id));
  if (deleted.length > 0) {
    sb.from("missed_words")
      .delete()
      .eq("user_id", uid)
      .in("word_id", deleted)
      .then(({ error }) => error && warnRemote(error));
  }
}

/** Bookmark a word (Space during a session) — shown as "저장" in the review list. */
export function saveWord(id: string) {
  const cur = misses.get(id);
  if (cur?.saved) return;
  misses.set(id, { wrongCount: cur?.wrongCount ?? 0, saved: true });
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const entry = misses.get(id)!;
  sb.from("missed_words")
    .upsert(
      [
        {
          user_id: activeUserId,
          word_id: id,
          wrong_count: entry.wrongCount,
          saved: true,
          last_missed_at: new Date().toISOString(),
        },
      ],
      { onConflict: "user_id,word_id" },
    )
    .then(({ error }) => error && warnRemote(error));
}

export function clearAll() {
  if (misses.size === 0) return;
  misses.clear();
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  sb.from("missed_words")
    .delete()
    .eq("user_id", activeUserId)
    .then(({ error }) => error && warnRemote(error));
}

/** Clear only the miss-driven entries; saved bookmarks are kept (wrongCount reset to 0). */
export function clearWrong() {
  const toDelete: string[] = [];
  const toKeep: string[] = [];
  for (const [id, entry] of misses) {
    if (entry.saved) {
      misses.set(id, { wrongCount: 0, saved: true });
      toKeep.push(id);
    } else {
      misses.delete(id);
      toDelete.push(id);
    }
  }
  if (toDelete.length === 0 && toKeep.length === 0) return;
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const uid = activeUserId;

  if (toDelete.length > 0) {
    sb.from("missed_words")
      .delete()
      .eq("user_id", uid)
      .in("word_id", toDelete)
      .then(({ error }) => error && warnRemote(error));
  }
  if (toKeep.length > 0) {
    const rows = toKeep.map((word_id) => ({
      user_id: uid,
      word_id,
      wrong_count: 0,
      saved: true,
      last_missed_at: new Date().toISOString(),
    }));
    sb.from("missed_words")
      .upsert(rows, { onConflict: "user_id,word_id" })
      .then(({ error }) => error && warnRemote(error));
  }
}

/** Clear only the saved bookmarks; miss-driven entries are kept (saved flag cleared). */
export function clearSaved() {
  const toDelete: string[] = [];
  const toKeep: string[] = [];
  for (const [id, entry] of misses) {
    if (!entry.saved) continue;
    if (entry.wrongCount > 0) {
      misses.set(id, { wrongCount: entry.wrongCount, saved: false });
      toKeep.push(id);
    } else {
      misses.delete(id);
      toDelete.push(id);
    }
  }
  if (toDelete.length === 0 && toKeep.length === 0) return;
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const uid = activeUserId;

  if (toDelete.length > 0) {
    sb.from("missed_words")
      .delete()
      .eq("user_id", uid)
      .in("word_id", toDelete)
      .then(({ error }) => error && warnRemote(error));
  }
  if (toKeep.length > 0) {
    const rows = toKeep.map((word_id) => ({
      user_id: uid,
      word_id,
      wrong_count: misses.get(word_id)?.wrongCount ?? 1,
      saved: false,
      last_missed_at: new Date().toISOString(),
    }));
    sb.from("missed_words")
      .upsert(rows, { onConflict: "user_id,word_id" })
      .then(({ error }) => error && warnRemote(error));
  }
}

/** Remove one word from the "틀린 단어" list — a saved bookmark, if any, stays (wrongCount reset). */
export function clearWrongWord(id: string) {
  const cur = misses.get(id);
  if (!cur) return;
  const sb = getSupabase();
  const uid = activeUserId;

  if (cur.saved) {
    if (cur.wrongCount === 0) return;
    misses.set(id, { wrongCount: 0, saved: true });
    notify();
    if (sb && uid) {
      sb.from("missed_words")
        .upsert(
          [
            {
              user_id: uid,
              word_id: id,
              wrong_count: 0,
              saved: true,
              last_missed_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id,word_id" },
        )
        .then(({ error }) => error && warnRemote(error));
    }
    return;
  }

  misses.delete(id);
  notify();
  if (sb && uid) {
    sb.from("missed_words")
      .delete()
      .eq("user_id", uid)
      .eq("word_id", id)
      .then(({ error }) => error && warnRemote(error));
  }
}

/** Remove one word from the "저장한 단어" list — its miss count, if any, stays (saved cleared). */
export function clearSavedWord(id: string) {
  const cur = misses.get(id);
  if (!cur?.saved) return;
  const sb = getSupabase();
  const uid = activeUserId;

  if (cur.wrongCount > 0) {
    misses.set(id, { wrongCount: cur.wrongCount, saved: false });
    notify();
    if (sb && uid) {
      sb.from("missed_words")
        .upsert(
          [
            {
              user_id: uid,
              word_id: id,
              wrong_count: cur.wrongCount,
              saved: false,
              last_missed_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id,word_id" },
        )
        .then(({ error }) => error && warnRemote(error));
    }
    return;
  }

  misses.delete(id);
  notify();
  if (sb && uid) {
    sb.from("missed_words")
      .delete()
      .eq("user_id", uid)
      .eq("word_id", id)
      .then(({ error }) => error && warnRemote(error));
  }
}

/** Remove a single word from the all-time history list. */
export function clearHistoryWord(id: string) {
  if (!history.has(id)) return;
  history.delete(id);
  notifyHistory();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  sb.from("word_history")
    .delete()
    .eq("user_id", activeUserId)
    .eq("word_id", id)
    .then(({ error }) => error && warnHistoryRemote(error));
}

/** Wipe the entire all-time history list. */
export function clearHistoryAll() {
  if (history.size === 0) return;
  history.clear();
  notifyHistory();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  sb.from("word_history")
    .delete()
    .eq("user_id", activeUserId)
    .then(({ error }) => error && warnHistoryRemote(error));
}

async function syncMissedWordsOnLogin(sb: SupabaseClient, userId: string) {
  let rows: Array<{ word_id: string; wrong_count: number; saved?: boolean }>;

  const withSaved = await sb
    .from("missed_words")
    .select("word_id, wrong_count, saved")
    .eq("user_id", userId);

  if (!withSaved.error) {
    rows = withSaved.data ?? [];
  } else if (withSaved.error.code === "42703") {
    // `saved` column missing — DB predates that migration (see
    // supabase/schema.sql). Fall back so the pool still loads instead of
    // wiping out on every refresh; saved-only bookmarks just won't persist
    // remotely until the migration runs.
    const legacy = await sb
      .from("missed_words")
      .select("word_id, wrong_count")
      .eq("user_id", userId);
    if (legacy.error) {
      warnRemote(legacy.error);
      return;
    }
    rows = legacy.data ?? [];
  } else {
    warnRemote(withSaved.error);
    return;
  }

  for (const row of rows) {
    const cur = misses.get(row.word_id);
    misses.set(row.word_id, {
      wrongCount: Math.max(cur?.wrongCount ?? 0, row.wrong_count),
      saved: (cur?.saved ?? false) || Boolean(row.saved),
    });
  }
  notify();

  if (misses.size > 0) {
    const rows2 = [...misses].map(([word_id, entry]) => ({
      user_id: userId,
      word_id,
      wrong_count: entry.wrongCount,
      saved: entry.saved,
      last_missed_at: new Date().toISOString(),
    }));
    const { error: upErr } = await sb
      .from("missed_words")
      .upsert(rows2, { onConflict: "user_id,word_id" });
    if (upErr) warnRemote(upErr);
  }
}

async function syncHistoryOnLogin(sb: SupabaseClient, userId: string) {
  const { data, error } = await sb
    .from("word_history")
    .select("word_id, wrong_count")
    .eq("user_id", userId);
  if (error) {
    warnHistoryRemote(error);
    return;
  }

  for (const row of data ?? []) {
    history.set(row.word_id, Math.max(history.get(row.word_id) ?? 0, row.wrong_count));
  }
  notifyHistory();

  if (history.size > 0) {
    const rows = [...history].map(([word_id, wrong_count]) => ({
      user_id: userId,
      word_id,
      wrong_count,
      last_missed_at: new Date().toISOString(),
    }));
    const { error: upErr } = await sb
      .from("word_history")
      .upsert(rows, { onConflict: "user_id,word_id" });
    if (upErr) warnHistoryRemote(upErr);
  }
}

/** On login: pull remote pool + history, merge (max wins — idempotent), push merged. */
export async function attachUser(userId: string) {
  activeUserId = userId;
  const sb = getSupabase();
  if (!sb) return;

  await Promise.all([
    syncMissedWordsOnLogin(sb, userId),
    syncHistoryOnLogin(sb, userId),
  ]);
}

/** On logout: drop the local pool so the account's words don't leak into guest mode. Remote rows stay. */
export function detachUser() {
  if (activeUserId === null) return;
  activeUserId = null;
  misses.clear();
  history.clear();
  notify();
  notifyHistory();
}
