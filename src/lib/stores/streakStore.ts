import { useSyncExternalStore } from "react";
import { getSupabase } from "../supabase";

/**
 * Per-day count of words typed, for the home-screen streak calendar.
 * Guest: no tracking at all — the calendar only ever shows the login
 * prompt for logged-out users, so there is nothing to keep locally.
 * Signed in: mirrored to the Supabase `daily_activity` table (see
 * supabase/schema.sql), pulled in full on login.
 */

export interface StreakPool {
  byDate: ReadonlyMap<string, number>;
}

const daily = new Map<string, number>();
const listeners = new Set<() => void>();
let activeUserId: string | null = null;
let remoteWarned = false;
let snapshot: StreakPool = buildSnapshot();

function buildSnapshot(): StreakPool {
  return { byDate: new Map(daily) };
}

function notify() {
  snapshot = buildSnapshot();
  listeners.forEach((fn) => fn());
}

function warnRemote(err: unknown) {
  if (remoteWarned) return;
  remoteWarned = true;
  console.warn(
    "[TypeSee] 학습 스트릭 DB 동기화 실패 — 기록되지 않습니다. " +
      "v2/supabase/schema.sql 이 실행되었는지 확인하세요.",
    err,
  );
}

/** Local (not UTC) YYYY-MM-DD — keeps the day boundary at the user's midnight. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useStreak(): StreakPool {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
    () => snapshot, // SSR: 초기(빈) 풀
  );
}

/** Add to today's word count. No-op for guests — nothing to persist. */
export function recordDailyActivity(wordsTyped: number) {
  if (wordsTyped <= 0) return;
  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  const uid = activeUserId;

  const key = localDateKey(new Date());
  const total = (daily.get(key) ?? 0) + wordsTyped;
  daily.set(key, total);
  notify();

  sb.from("daily_activity")
    .upsert(
      [{ user_id: uid, activity_date: key, words_typed: total }],
      { onConflict: "user_id,activity_date" },
    )
    .then(({ error }) => error && warnRemote(error));
}

/** On login: pull the user's full history and populate the local map. */
export async function attachUser(userId: string) {
  activeUserId = userId;
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from("daily_activity")
    .select("activity_date, words_typed")
    .eq("user_id", userId);
  if (error) {
    warnRemote(error);
    return;
  }

  daily.clear();
  for (const row of data ?? []) {
    daily.set(row.activity_date, row.words_typed);
  }
  notify();
}

/** On logout: drop the local map so one account's streak doesn't leak into the next. */
export function detachUser() {
  if (activeUserId === null) return;
  activeUserId = null;
  daily.clear();
  notify();
}
