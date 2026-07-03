import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";

/**
 * Pool of missed words.
 * Guest: in-memory only — closing or refreshing the tab clears it (by design).
 * Signed in: mirrored to the Supabase `missed_words` table (see supabase/schema.sql),
 * merged with the local pool on login. Remote failures degrade to local-only.
 */

export interface ReviewPool {
  count: number;
  ids: ReadonlySet<string>;
  wrongCountOf: (id: string) => number;
}

const misses = new Map<string, number>();
const listeners = new Set<() => void>();
let activeUserId: string | null = null;
let remoteWarned = false;
let snapshot: ReviewPool = buildSnapshot();

function buildSnapshot(): ReviewPool {
  const frozen = new Map(misses);
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

function warnRemote(err: unknown) {
  if (remoteWarned) return;
  remoteWarned = true;
  console.warn(
    "[TypeSee] 복습 단어 DB 동기화 실패 — 로컬 메모리로만 동작합니다. " +
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

export function recordSession(
  missed: Array<{ id: string; count: number }>,
  mastered: string[],
) {
  if (missed.length === 0 && mastered.length === 0) return;

  for (const { id, count } of missed) {
    misses.set(id, (misses.get(id) ?? 0) + count);
  }
  for (const id of mastered) {
    misses.delete(id);
  }
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const uid = activeUserId;

  if (missed.length > 0) {
    const rows = missed.map(({ id }) => ({
      user_id: uid,
      word_id: id,
      wrong_count: misses.get(id) ?? 1,
      last_missed_at: new Date().toISOString(),
    }));
    sb.from("missed_words")
      .upsert(rows, { onConflict: "user_id,word_id" })
      .then(({ error }) => error && warnRemote(error));
  }
  if (mastered.length > 0) {
    sb.from("missed_words")
      .delete()
      .eq("user_id", uid)
      .in("word_id", mastered)
      .then(({ error }) => error && warnRemote(error));
  }
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

/** On login: pull remote pool, merge (max wins — idempotent), push merged. */
export async function attachUser(userId: string) {
  activeUserId = userId;
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from("missed_words")
    .select("word_id, wrong_count")
    .eq("user_id", userId);
  if (error) {
    warnRemote(error);
    return;
  }

  for (const row of data ?? []) {
    misses.set(
      row.word_id,
      Math.max(misses.get(row.word_id) ?? 0, row.wrong_count),
    );
  }
  notify();

  if (misses.size > 0) {
    const rows = [...misses].map(([word_id, wrong_count]) => ({
      user_id: userId,
      word_id,
      wrong_count,
      last_missed_at: new Date().toISOString(),
    }));
    const { error: upErr } = await sb
      .from("missed_words")
      .upsert(rows, { onConflict: "user_id,word_id" });
    if (upErr) warnRemote(upErr);
  }
}

/** On logout: drop the local pool so the account's words don't leak into guest mode. Remote rows stay. */
export function detachUser() {
  if (activeUserId === null) return;
  activeUserId = null;
  misses.clear();
  notify();
}
