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
  /** TS-1 ease factor — 낮을수록 약한 단어라 세션에 더 자주 등장한다. */
  ease: number;
}

/** TS-1 파라미터: 오타는 ease 를 내리고 정타 통과는 올린다.
 *  EASE_MASTER 에 도달해야 마스터(풀에서 제거)된다. */
export const EASE_INIT = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MASTER = 3.0;
const EASE_WRONG_STEP = 0.2;
const EASE_RIGHT_STEP = 0.25;

/** TS-1 세션 추첨 가중치 — ease 가 낮을수록 제곱으로 커진다. */
export function appearanceWeight(ease: number): number {
  const gap = EASE_MASTER + 0.2 - ease;
  return gap * gap;
}

export interface ReviewPool {
  count: number;
  ids: ReadonlySet<string>;
  wrongCountOf: (id: string) => number;
  isSaved: (id: string) => boolean;
  easeOf: (id: string) => number;
  /** 직전 세션에서 정타로 통과해 바로 다음 일반 세션은 쉬는 단어. */
  inCooldown: (id: string) => boolean;
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
const cooldown = new Set<string>();
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
  const frozenCooldown = new Set(cooldown);
  return {
    count: frozen.size,
    ids: new Set(frozen.keys()),
    wrongCountOf: (id) => frozen.get(id)?.wrongCount ?? 0,
    isSaved: (id) => frozen.get(id)?.saved ?? false,
    easeOf: (id) => frozen.get(id)?.ease ?? EASE_INIT,
    inCooldown: (id) => frozenCooldown.has(id),
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
  persistLocal();
}

function notifyHistory() {
  historySnapshot = buildHistorySnapshot();
  historyListeners.forEach((fn) => fn());
  persistLocal();
}

/* ── 게스트 localStorage 백업 ─────────────────────────────────────────
   새로고침해도 복습 풀·오답 기록이 날아가지 않게 로컬에도 남긴다.
   로그인 유저에게는 오프라인 캐시 역할 (다음 로그인 때 DB와 병합).
   서버 HTML과 하이드레이션 첫 렌더가 일치해야 하므로 모듈 로드 시점이
   아니라 App 마운트 후 hydrateLocal() 에서 읽는다. */

const POOL_STORAGE_KEY = "typesee:review-pool:v1";
const HISTORY_STORAGE_KEY = "typesee:word-history:v1";
let hydrated = false;

function persistLocal() {
  // 하이드레이션 전에 쓰면 이전 백업을 빈 풀로 덮어쓸 수 있다
  if (typeof window === "undefined" || !hydrated) return;
  try {
    localStorage.setItem(POOL_STORAGE_KEY, JSON.stringify([...misses]));
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([...history]));
  } catch {
    // 저장 공간 부족 등 — 백업일 뿐이니 앱 동작은 계속한다
  }
}

/** App 마운트 직후 1회 — localStorage 백업을 메모리 풀에 병합한다. */
export function hydrateLocal() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const rawPool = localStorage.getItem(POOL_STORAGE_KEY);
    if (rawPool) {
      for (const [id, e] of JSON.parse(rawPool) as Array<
        [string, Partial<Entry>]
      >) {
        if (typeof id !== "string") continue;
        const cur = misses.get(id);
        const wrongCount = Math.max(
          cur?.wrongCount ?? 0,
          Math.max(0, Math.floor(Number(e?.wrongCount) || 0)),
        );
        const saved = (cur?.saved ?? false) || e?.saved === true;
        const rawEase = Number(e?.ease);
        const storedEase = Number.isFinite(rawEase)
          ? Math.min(Math.max(rawEase, EASE_MIN), EASE_MASTER)
          : EASE_INIT;
        // 로그인 병합과 같은 규칙: 낮은(약한) ease 쪽이 이긴다
        const ease = Math.min(cur?.ease ?? EASE_INIT, storedEase);
        if (wrongCount > 0 || saved) misses.set(id, { wrongCount, saved, ease });
      }
      if (misses.size > 0) notify();
    }

    const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (rawHistory) {
      for (const [id, count] of JSON.parse(rawHistory) as Array<
        [string, number]
      >) {
        if (typeof id !== "string") continue;
        const n = Math.max(0, Math.floor(Number(count) || 0));
        if (n > 0) history.set(id, Math.max(history.get(id) ?? 0, n));
      }
      if (history.size > 0) notifyHistory();
    }
  } catch {
    // 손상된 백업은 버린다 — 다음 persistLocal 이 정상 상태로 덮어쓴다
  }
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

/** 테스트 전용 — 훅 없이 현재 풀 스냅샷을 읽는다. */
export function getReviewPool(): ReviewPool {
  return snapshot;
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
  passed: string[],
) {
  if (missed.length === 0 && passed.length === 0) return;

  for (const { id, count } of missed) {
    const cur = misses.get(id);
    misses.set(id, {
      wrongCount: (cur?.wrongCount ?? 0) + count,
      saved: cur?.saved ?? false,
      ease: Math.max(EASE_MIN, (cur?.ease ?? EASE_INIT) - EASE_WRONG_STEP * count),
    });
    history.set(id, (history.get(id) ?? 0) + count);
  }
  // TS-1: 정타 통과는 ease 를 올릴 뿐, EASE_MASTER 도달 전까지는 풀에 남아
  // 낮아진 확률로 계속 등장한다. A saved (bookmarked) word stays in the pool
  // even once mastered — only its miss-driven presence is cleared (ease is
  // reset so the bookmark isn't starved by its own near-zero weight).
  // History is untouched either way.
  for (const id of passed) {
    const cur = misses.get(id);
    if (!cur) continue;
    const ease = cur.ease + EASE_RIGHT_STEP;
    if (ease >= EASE_MASTER) {
      if (cur.saved) misses.set(id, { wrongCount: 0, saved: true, ease: EASE_INIT });
      else misses.delete(id);
    } else {
      misses.set(id, { ...cur, ease });
    }
  }

  // 쿨다운: 방금 정타로 통과하고도 풀에 남은 단어는 다음 일반 세션에서 쉰다.
  cooldown.clear();
  for (const id of passed) if (misses.has(id)) cooldown.add(id);

  notify();
  if (missed.length > 0) notifyHistory();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const uid = activeUserId;

  const upserted = [
    ...missed.map(({ id }) => id),
    ...passed.filter((id) => misses.has(id)),
  ];
  if (upserted.length > 0) {
    const rows = upserted.map((id) => ({
      user_id: uid,
      word_id: id,
      wrong_count: misses.get(id)?.wrongCount ?? 1,
      saved: misses.get(id)?.saved ?? false,
      ease_factor: misses.get(id)?.ease ?? EASE_INIT,
      last_missed_at: new Date().toISOString(),
    }));
    sb.from("missed_words")
      .upsert(rows, { onConflict: "user_id,word_id" })
      .then(({ error }) => error && warnRemote(error));
  }
  if (missed.length > 0) {
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
  const deleted = passed.filter((id) => !misses.has(id));
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
  misses.set(id, {
    wrongCount: cur?.wrongCount ?? 0,
    saved: true,
    ease: cur?.ease ?? EASE_INIT,
  });
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
          ease_factor: entry.ease,
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
      misses.set(id, { wrongCount: 0, saved: true, ease: entry.ease });
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
      ease_factor: misses.get(word_id)?.ease ?? EASE_INIT,
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
      misses.set(id, { wrongCount: entry.wrongCount, saved: false, ease: entry.ease });
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
      ease_factor: misses.get(word_id)?.ease ?? EASE_INIT,
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
    misses.set(id, { wrongCount: 0, saved: true, ease: cur.ease });
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
              ease_factor: cur.ease,
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
    misses.set(id, { wrongCount: cur.wrongCount, saved: false, ease: cur.ease });
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
              ease_factor: cur.ease,
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
  let rows: Array<{
    word_id: string;
    wrong_count: number;
    saved?: boolean;
    ease_factor?: number;
  }>;

  // Newer columns (`saved`, `ease_factor`) may be missing on a DB that
  // predates their migrations (see supabase/schema.sql). Fall back
  // progressively so the pool still loads instead of wiping out on every
  // refresh; the missing fields just won't persist remotely until the
  // migration runs.
  const withEase = await sb
    .from("missed_words")
    .select("word_id, wrong_count, saved, ease_factor")
    .eq("user_id", userId);

  if (!withEase.error) {
    rows = withEase.data ?? [];
  } else if (withEase.error.code === "42703") {
    const withSaved = await sb
      .from("missed_words")
      .select("word_id, wrong_count, saved")
      .eq("user_id", userId);
    if (!withSaved.error) {
      rows = withSaved.data ?? [];
    } else if (withSaved.error.code === "42703") {
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
  } else {
    warnRemote(withEase.error);
    return;
  }

  for (const row of rows) {
    const cur = misses.get(row.word_id);
    misses.set(row.word_id, {
      wrongCount: Math.max(cur?.wrongCount ?? 0, row.wrong_count),
      saved: (cur?.saved ?? false) || Boolean(row.saved),
      // 낮은(약한) ease 쪽이 이긴다 — 덜 외운 상태로 보는 게 안전하다.
      ease: Math.min(cur?.ease ?? EASE_INIT, row.ease_factor ?? EASE_INIT),
    });
  }
  notify();

  if (misses.size > 0) {
    const rows2 = [...misses].map(([word_id, entry]) => ({
      user_id: userId,
      word_id,
      wrong_count: entry.wrongCount,
      saved: entry.saved,
      ease_factor: entry.ease,
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
  cooldown.clear();
  history.clear();
  notify();
  notifyHistory();
}
