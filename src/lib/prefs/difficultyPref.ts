import { useSyncExternalStore } from "react";

/** Quiz/Listening 스캐폴딩 난이도 — 두 모드가 값을 공유한다. */

export type Difficulty = "easy" | "normal" | "hard";

const STORAGE_KEY = "typesee:difficulty";
const listeners = new Set<() => void>();
let difficulty: Difficulty = "normal";
let hydrated = false;

export function useDifficultyPref(): Difficulty {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => difficulty,
    () => "normal", // SSR 기본값
  );
}

export function setDifficulty(next: Difficulty) {
  difficulty = next;
  listeners.forEach((fn) => fn());
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 저장 공간 부족 등 — 이번 세션 동안만 유지된다
  }
}

/** App 마운트 직후 1회 — localStorage 백업을 읽어온다. */
export function hydrateDifficultyPref() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "easy" || raw === "normal" || raw === "hard") {
      difficulty = raw;
      listeners.forEach((fn) => fn());
    }
  } catch {
    // 손상된 백업은 버린다
  }
}
