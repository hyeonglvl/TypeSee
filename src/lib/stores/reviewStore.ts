import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../supabase";
import type { WordOutcomeTier } from "../types";

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
  /** 정답 보기로 철자를 열어본 적 있는 단어 — 복습 노트 라벨용. */
  revealed: boolean;
  /** TS-1 ease factor — 낮을수록 약한 단어라 세션에 더 자주 등장한다. */
  ease: number;
  /** 세션에서 마지막으로 실제 학습(오답·정타 통과·저장)한 시각(ms).
   *  null = 미상(구버전 백업) — 시간 가중치는 중립(1)으로 본다. */
  lastSeenAt: number | null;
  /** 마스터한 시각(ms). null 이면 활성(복습 중), 값이 있으면 마스터 유지
   *  점검 대상 — 일반 세션에 낮은 빈도로 재출현하고, 틀리면 활성으로
   *  복귀한다. */
  masteredAt: number | null;
}

/** TS-1 파라미터: 오타는 ease 를 내리고 정타 통과는 올린다.
 *  EASE_MASTER 에 도달해야 마스터(풀에서 제거)된다. */
export const EASE_INIT = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MASTER = 3.0;
/** major(끝까지 오답·정답 보기) 판정의 하락폭. */
const EASE_MAJOR_STEP = 0.2;
/** minor(정답이지만 오타/힌트가 있었음) 판정의 하락폭 — major 보다 가볍다. */
const EASE_MINOR_STEP = 0.1;
const EASE_RIGHT_STEP = 0.25;

/** TS-1 세션 추첨 가중치 — ease 가 낮을수록 제곱으로 커진다. */
export function appearanceWeight(ease: number): number {
  const gap = EASE_MASTER + 0.2 - ease;
  return gap * gap;
}

/** TS-1 시간 가중치: 오래 안 본 단어일수록 출현 확률을 올려, 날짜 스케줄
 *  없이 간격 효과(spacing effect)를 근사한다. 1(방금 봄·미상)에서
 *  TIME_WEIGHT_SATURATION_DAYS 에 걸쳐 TIME_WEIGHT_MAX 까지 선형 증가.
 *  상한 3× 근거: appearanceWeight 는 0.04(ease 3.0)~3.61(ease 1.3) 범위라,
 *  일주일 묵은 마스터 직전 단어(0.04×3)가 방금 틀린 약한 단어(3.61×1)를
 *  넘어설 수 없다. */
export const TIME_WEIGHT_MAX = 3;
export const TIME_WEIGHT_SATURATION_DAYS = 7;
const DAY_MS = 86_400_000;

export function timeWeight(lastSeenAt: number | null, now: number): number {
  if (lastSeenAt === null) return 1;
  const days = Math.max(0, now - lastSeenAt) / DAY_MS;
  return (
    1 +
    (TIME_WEIGHT_MAX - 1) * Math.min(1, days / TIME_WEIGHT_SATURATION_DAYS)
  );
}

/** ease 1.3~3.0 → 1..5 익힘 단계 — 세션 카드 배지의 점 진행도에 쓴다.
 *  floor 라서 실제로 올라야 단계가 상승한다 (1.3→1, 2.5→3, 3.0→5). */
export function easeProgress(ease: number): number {
  return Math.max(
    1,
    Math.min(5, 1 + Math.floor(((ease - EASE_MIN) / (EASE_MASTER - EASE_MIN)) * 4)),
  );
}

/** TS-1 ease(1.3~3.0)를 4단계 라벨로 — 틀린 느낌(빨강)에서 맞춘
 *  느낌(초록)으로. 기준점: 새 오답 2.3 → 주의, 갓 저장 2.5 → 안정,
 *  마스터 임박 → 완성. tone 은 화면별 CSS 클래스에 매핑한다. */
export type EaseStageTone = "weak" | "wary" | "stable" | "done";

export function easeStage(ease: number): {
  label: string;
  tone: EaseStageTone;
} {
  if (ease <= 1.9) return { label: "취약 단어", tone: "weak" };
  if (ease <= 2.4) return { label: "주의 단어", tone: "wary" };
  if (ease <= 2.8) return { label: "안정 단어", tone: "stable" };
  return { label: "완성 단어", tone: "done" };
}

/** 세션 추첨 최종 가중치 = ease 가중치 × 시간 가중치. */
export function sessionWeight(
  ease: number,
  lastSeenAt: number | null,
  now: number,
): number {
  return appearanceWeight(ease) * timeWeight(lastSeenAt, now);
}

/** 두 시각 중 더 최근 값 — 한쪽만 있으면 그 값, 둘 다 없으면 null. */
function laterOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** ms epoch → DB 저장용 ISO 문자열 (미상이면 null). */
function toIso(ms: number | null | undefined): string | null {
  return typeof ms === "number" ? new Date(ms).toISOString() : null;
}

/** DB의 ISO 문자열 → ms epoch (없거나 손상이면 null). */
function fromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export interface ReviewPool {
  /** 활성(미마스터) 단어 수 — 홈 복습 카드·복습 노트가 쓰는 값. */
  count: number;
  /** 활성(미마스터) 단어 id — 마스터 유지 단어는 retainedIds 에 있다. */
  ids: ReadonlySet<string>;
  /** 마스터 유지 점검 대상 단어 id. */
  retainedIds: ReadonlySet<string>;
  /** 마스터한 시각(ms) — 활성 단어면 null. */
  masteredAtOf: (id: string) => number | null;
  wrongCountOf: (id: string) => number;
  isSaved: (id: string) => boolean;
  /** 정답 보기로 열어본 적 있는 단어 — 복습 노트 '정답 봄' 라벨. */
  isRevealed: (id: string) => boolean;
  easeOf: (id: string) => number;
  /** 마지막으로 실제 학습한 시각(ms) — 시간 가중치용, 미상이면 null. */
  lastSeenAtOf: (id: string) => number | null;
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
  const activeIds = new Set<string>();
  const retainedIds = new Set<string>();
  for (const [id, entry] of frozen)
    (entry.masteredAt === null ? activeIds : retainedIds).add(id);
  return {
    count: activeIds.size,
    ids: activeIds,
    retainedIds,
    masteredAtOf: (id) => frozen.get(id)?.masteredAt ?? null,
    wrongCountOf: (id) => frozen.get(id)?.wrongCount ?? 0,
    isSaved: (id) => frozen.get(id)?.saved ?? false,
    isRevealed: (id) => frozen.get(id)?.revealed ?? false,
    easeOf: (id) => frozen.get(id)?.ease ?? EASE_INIT,
    lastSeenAtOf: (id) => frozen.get(id)?.lastSeenAt ?? null,
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
  outcomes: Array<{ id: string; tier: WordOutcomeTier; revealed: boolean }>,
) {
  if (outcomes.length === 0) return;
  const now = Date.now();

  const missed = outcomes.filter((o) => o.tier !== "clean");
  const passed = outcomes.filter((o) => o.tier === "clean").map((o) => o.id);

  for (const { id, tier, revealed } of missed) {
    const cur = misses.get(id);
    // 마스터 유지 점검 실패는 새 오답처럼 EASE_INIT 기준으로 강등한다 —
    // 3.0 에서 조금만 내리면 정타 한 번에 재마스터돼 점검이 무력해진다.
    const baseEase =
      cur?.masteredAt != null ? EASE_INIT : (cur?.ease ?? EASE_INIT);
    const step = tier === "major" ? EASE_MAJOR_STEP : EASE_MINOR_STEP;
    misses.set(id, {
      wrongCount: (cur?.wrongCount ?? 0) + 1,
      saved: cur?.saved ?? false,
      revealed: (cur?.revealed ?? false) || revealed,
      ease: Math.max(EASE_MIN, baseEase - step),
      lastSeenAt: now,
      masteredAt: null,
    });
    history.set(id, (history.get(id) ?? 0) + 1);
  }
  // TS-1: 정타 통과는 ease 를 올릴 뿐, EASE_MASTER 도달 전까지는 풀에 남아
  // 낮아진 확률로 계속 등장한다. A saved (bookmarked) word stays in the pool
  // even once mastered — only its miss-driven presence is cleared (ease is
  // reset so the bookmark isn't starved by its own near-zero weight).
  // History is untouched either way.
  // lastSeenAt=now(시간 가중치 1) + 쿨다운으로 통과 단어는 다음 세션에서
  // 이중으로 억제되는데, 방금 맞힌 단어를 곧바로 또 보여주지 않으려는
  // 의도된 동작이다.
  for (const id of passed) {
    const cur = misses.get(id);
    if (!cur) continue;
    // 마스터 유지 점검 통과: 마스터 상태 그대로, 시각만 갱신한다.
    if (cur.masteredAt !== null) {
      misses.set(id, { ...cur, masteredAt: now, lastSeenAt: now });
      continue;
    }
    const ease = cur.ease + EASE_RIGHT_STEP;
    if (ease >= EASE_MASTER) {
      if (cur.saved)
        misses.set(id, {
          wrongCount: 0,
          saved: true,
          revealed: cur.revealed,
          ease: EASE_INIT,
          lastSeenAt: now,
          masteredAt: null,
        });
      // 마스터: 삭제하는 대신 유지 점검 대상으로 남긴다. wrongCount 0 리셋로
      // 세션 카드 배지가 사라져, 재출현 시 유저가 눈치채지 못하는 블라인드
      // 점검이 된다.
      else
        misses.set(id, {
          wrongCount: 0,
          saved: false,
          revealed: cur.revealed,
          ease: EASE_MASTER,
          lastSeenAt: now,
          masteredAt: now,
        });
    } else {
      misses.set(id, { ...cur, ease, lastSeenAt: now });
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
      revealed: misses.get(id)?.revealed ?? false,
      ease_factor: misses.get(id)?.ease ?? EASE_INIT,
      last_seen_at: toIso(misses.get(id)?.lastSeenAt),
      mastered_at: toIso(misses.get(id)?.masteredAt),
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

/** Bookmark a word (Typing 모드 "저장하기", 키 1) — 복습 노트에 "저장" 으로
 *  표시된다. saved 플래그를 설정하는 유일한 경로다.
 *  revealed 파라미터는 saveWord 를 통해 새로 켜지는 경로가 더 이상 없다
 *  (정답 보기는 recordSession 이 세션 종료 시 처리한다) — 이미 켜져 있던
 *  값을 보존하는 용도로만 남아 있다. */
export function saveWord(id: string, revealed = false) {
  const cur = misses.get(id);
  if (cur?.saved && (cur.revealed || !revealed)) return;
  // 마스터 유지 상태였던 단어를 저장하면 활성 북마크로 복귀한다 — ease 를
  // 리셋해 자기 가중치(≈0)에 굶지 않게 (saved 마스터와 같은 규칙).
  const baseEase = cur?.masteredAt != null ? EASE_INIT : (cur?.ease ?? EASE_INIT);
  // 정답 보기로 처음 넘어온 거라면 "몰랐다"는 뜻이라 오답 한 번과 같은
  // 폭으로 ease 를 낮춘다 — 중립값(EASE_INIT)을 그대로 쓰면 방금 모르고
  // 넘긴 단어가 바로 '안정 단어'로 표시되는 모순이 생긴다. 이미
  // revealed 였던 단어(재노출)나 순수 북마크 저장은 그대로 둔다.
  const ease =
    revealed && !cur?.revealed
      ? Math.max(EASE_MIN, baseEase - EASE_MAJOR_STEP)
      : baseEase;
  misses.set(id, {
    wrongCount: cur?.wrongCount ?? 0,
    saved: true,
    revealed: (cur?.revealed ?? false) || revealed,
    ease,
    lastSeenAt: Date.now(), // 저장하는 순간 화면에 떠 있는 단어다
    masteredAt: null,
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
          revealed: entry.revealed,
          ease_factor: entry.ease,
          last_seen_at: toIso(entry.lastSeenAt),
          mastered_at: toIso(entry.masteredAt),
          last_missed_at: new Date().toISOString(),
        },
      ],
      { onConflict: "user_id,word_id" },
    )
    .then(({ error }) => error && warnRemote(error));
}

export function clearAll() {
  if (misses.size === 0) return;
  // 마스터 유지 상태도 함께 지워진다 — "모두 지우기"는 완전 초기화다.
  misses.clear();
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  sb.from("missed_words")
    .delete()
    .eq("user_id", activeUserId)
    .then(({ error }) => error && warnRemote(error));
}

/** Clear only the miss-driven entries; saved bookmarks are kept (wrongCount
 *  reset to 0). 마스터 유지(non-saved) 엔트리도 함께 지워진다. */
export function clearWrong() {
  const toDelete: string[] = [];
  const toKeep: string[] = [];
  for (const [id, entry] of misses) {
    if (entry.saved) {
      misses.set(id, { ...entry, wrongCount: 0 });
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
      revealed: misses.get(word_id)?.revealed ?? false,
      ease_factor: misses.get(word_id)?.ease ?? EASE_INIT,
      last_seen_at: toIso(misses.get(word_id)?.lastSeenAt),
      mastered_at: toIso(misses.get(word_id)?.masteredAt),
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
      misses.set(id, { ...entry, saved: false });
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
      revealed: misses.get(word_id)?.revealed ?? false,
      ease_factor: misses.get(word_id)?.ease ?? EASE_INIT,
      last_seen_at: toIso(misses.get(word_id)?.lastSeenAt),
      mastered_at: toIso(misses.get(word_id)?.masteredAt),
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
    misses.set(id, { ...cur, wrongCount: 0 });
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
              revealed: cur.revealed,
              ease_factor: cur.ease,
              last_seen_at: toIso(cur.lastSeenAt),
              mastered_at: toIso(cur.masteredAt),
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
    misses.set(id, { ...cur, saved: false });
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
              revealed: cur.revealed,
              ease_factor: cur.ease,
              last_seen_at: toIso(cur.lastSeenAt),
              mastered_at: toIso(cur.masteredAt),
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
  type PoolRow = {
    word_id: string;
    wrong_count: number;
    saved?: boolean;
    revealed?: boolean;
    ease_factor?: number;
    last_seen_at?: string | null;
    mastered_at?: string | null;
  };

  // Newer columns (`saved`, `ease_factor`, `last_seen_at`, `mastered_at`,
  // `revealed`) may be missing on a DB that predates their migrations (see
  // supabase/schema.sql). Fall back progressively (42703 = undefined column)
  // so the pool still loads instead of wiping out on every refresh; the
  // missing fields just won't persist remotely until the migration runs.
  const selectFallbacks = [
    "word_id, wrong_count, saved, revealed, ease_factor, last_seen_at, mastered_at",
    "word_id, wrong_count, saved, ease_factor, last_seen_at, mastered_at",
    "word_id, wrong_count, saved, ease_factor",
    "word_id, wrong_count, saved",
    "word_id, wrong_count",
  ];
  let rows: PoolRow[] | null = null;
  for (const columns of selectFallbacks) {
    const res = await sb
      .from("missed_words")
      .select(columns)
      .eq("user_id", userId);
    if (!res.error) {
      rows = (res.data ?? []) as unknown as PoolRow[];
      break;
    }
    if (res.error.code !== "42703") {
      warnRemote(res.error);
      return;
    }
  }
  if (rows === null) return; // 모든 폴백이 42703 — 테이블 구조가 예상 밖

  for (const row of rows) {
    const cur = misses.get(row.word_id);
    const remoteMastered = fromIso(row.mastered_at);
    const remoteEase = row.ease_factor ?? EASE_INIT;
    misses.set(row.word_id, {
      wrongCount: Math.max(cur?.wrongCount ?? 0, row.wrong_count),
      saved: (cur?.saved ?? false) || Boolean(row.saved),
      revealed: (cur?.revealed ?? false) || Boolean(row.revealed),
      // 양쪽에 있으면 낮은(약한) ease 가 이긴다 — 덜 외운 상태로 보는 게
      // 안전하다. 로컬에 없던 단어는 원격 값을 그대로 쓴다 (EASE_INIT
      // 상한으로 깎으면 2.5를 넘긴 진행분이 로그인마다 증발한다).
      ease: cur ? Math.min(cur.ease, remoteEase) : remoteEase,
      // 더 최근에 본 쪽이 이긴다
      lastSeenAt: laterOf(cur?.lastSeenAt ?? null, fromIso(row.last_seen_at)),
      // 한쪽이라도 활성(미마스터)이면 활성 — min-ease 와 같은 철학.
      // 로컬에 없던 단어는 원격 상태를 그대로 따른다.
      masteredAt: cur
        ? cur.masteredAt !== null && remoteMastered !== null
          ? Math.max(cur.masteredAt, remoteMastered)
          : null
        : remoteMastered,
    });
  }
  notify();

  if (misses.size > 0) {
    const rows2 = [...misses].map(([word_id, entry]) => ({
      user_id: userId,
      word_id,
      wrong_count: entry.wrongCount,
      saved: entry.saved,
      revealed: entry.revealed,
      ease_factor: entry.ease,
      // 재푸시는 동기화일 뿐 학습이 아니다 — 저장된 시각을 그대로 유지
      last_seen_at: toIso(entry.lastSeenAt),
      mastered_at: toIso(entry.masteredAt),
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
