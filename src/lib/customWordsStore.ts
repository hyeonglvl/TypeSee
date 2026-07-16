import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Pos, WordEntry, WordSense } from "./types";

/** 구버전 저장분(단수 pos·단일 예문 문자열)을 현행 배열 포맷으로 승격한다.
 *  localStorage 백업과 DB 행 양쪽에 옛 포맷이 남아 있을 수 있다. */
function normalizeSenses(raw: unknown): WordSense[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is { meaning: string; pos?: Pos | Pos[] } =>
        typeof s?.meaning === "string",
    )
    .map(({ meaning, pos }) => ({
      meaning,
      pos: pos === undefined ? undefined : Array.isArray(pos) ? pos : [pos],
    }));
}

function normalizeText(raw: unknown): string[] | undefined {
  if (typeof raw === "string") return raw ? [raw] : undefined;
  if (Array.isArray(raw))
    return raw.filter((s): s is string => typeof s === "string");
  return undefined;
}

/**
 * 사용자가 직접 추가한 단어("내 단어장") — STARTER_WORDS 와 완전히 분리된 풀.
 * 영속성 패턴은 reviewStore.ts 와 동일: 게스트는 인메모리 + localStorage 백업,
 * 로그인 유저는 Supabase `custom_words` 테이블과 동기화.
 */

const words = new Map<string, WordEntry>();
const listeners = new Set<() => void>();
let activeUserId: string | null = null;
let remoteWarned = false;
let snapshot: WordEntry[] = [];

function buildSnapshot(): WordEntry[] {
  return [...words.values()].sort((a, b) => a.word.localeCompare(b.word));
}

function notify() {
  snapshot = buildSnapshot();
  listeners.forEach((fn) => fn());
  persistLocal();
}

function warnRemote(err: unknown) {
  if (remoteWarned) return;
  remoteWarned = true;
  console.warn(
    "[TypeSee] 내 단어장 DB 동기화 실패 — 로컬 메모리로만 동작합니다. " +
      "supabase/schema.sql 이 실행되었는지 확인하세요.",
    err,
  );
}

const STORAGE_KEY = "typesee:custom-words:v1";
let hydrated = false;

function persistLocal() {
  if (typeof window === "undefined" || !hydrated) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...words.values()]));
  } catch {
    // 저장 공간 부족 등 — 백업일 뿐이니 앱 동작은 계속한다
  }
}

/** App 마운트 직후 1회 — localStorage 백업을 메모리 풀에 병합한다. */
export function hydrateLocal() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    for (const entry of JSON.parse(raw) as Array<
      Omit<WordEntry, "senses" | "example" | "exampleMeaning"> & {
        senses: unknown;
        example?: unknown;
        exampleMeaning?: unknown;
      }
    >) {
      if (typeof entry?.id === "string" && typeof entry?.word === "string")
        words.set(entry.id, {
          id: entry.id,
          word: entry.word,
          senses: normalizeSenses(entry.senses),
          example: normalizeText(entry.example),
          exampleMeaning: normalizeText(entry.exampleMeaning),
        });
    }
    if (words.size > 0) notify();
  } catch {
    // 손상된 백업은 버린다
  }
}

export function useCustomWords(): WordEntry[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
    () => snapshot, // SSR: 초기(빈) 풀
  );
}

function newId(): string {
  return `custom:${crypto.randomUUID()}`;
}

export function addCustomWord(entry: Omit<WordEntry, "id">): WordEntry {
  const saved: WordEntry = { ...entry, id: newId() };
  words.set(saved.id, saved);
  notify();

  const sb = getSupabase();
  if (sb && activeUserId) {
    sb.from("custom_words")
      .upsert(
        [
          {
            user_id: activeUserId,
            word_id: saved.id,
            word: saved.word,
            senses: saved.senses,
            // example 컬럼은 TEXT — 커스텀 단어는 예문이 하나뿐이라
            // 첫 항목만 저장한다 (읽을 때 normalizeText 가 배열로 승격).
            example: saved.example?.[0] ?? null,
            example_meaning: saved.exampleMeaning?.[0] ?? null,
          },
        ],
        { onConflict: "user_id,word_id" },
      )
      .then(({ error }) => error && warnRemote(error));
  }
  return saved;
}

export function removeCustomWord(id: string) {
  if (!words.delete(id)) return;
  notify();

  const sb = getSupabase();
  if (!sb || !activeUserId) return;
  sb.from("custom_words")
    .delete()
    .eq("user_id", activeUserId)
    .eq("word_id", id)
    .then(({ error }) => error && warnRemote(error));
}

async function syncOnLogin(sb: SupabaseClient, userId: string) {
  const { data, error } = await sb
    .from("custom_words")
    .select("word_id, word, senses, example, example_meaning")
    .eq("user_id", userId);
  if (error) {
    warnRemote(error);
    return;
  }

  for (const row of data ?? []) {
    if (words.has(row.word_id)) continue; // 로컬에 이미 있으면 로컬을 우선한다
    words.set(row.word_id, {
      id: row.word_id,
      word: row.word,
      senses: normalizeSenses(row.senses),
      example: normalizeText(row.example),
      exampleMeaning: normalizeText(row.example_meaning),
    });
  }
  notify();

  if (words.size > 0) {
    const rows = [...words.values()].map((w) => ({
      user_id: userId,
      word_id: w.id,
      word: w.word,
      senses: w.senses,
      example: w.example?.[0] ?? null,
      example_meaning: w.exampleMeaning?.[0] ?? null,
    }));
    const { error: upErr } = await sb
      .from("custom_words")
      .upsert(rows, { onConflict: "user_id,word_id" });
    if (upErr) warnRemote(upErr);
  }
}

/** On login: pull remote words, merge (local wins on id collision), push merged. */
export async function attachUser(userId: string) {
  activeUserId = userId;
  const sb = getSupabase();
  if (!sb) return;
  await syncOnLogin(sb, userId);
}

/** On logout: drop the local pool so the account's words don't leak into guest mode. Remote rows stay. */
export function detachUser() {
  if (activeUserId === null) return;
  activeUserId = null;
  words.clear();
  notify();
}
