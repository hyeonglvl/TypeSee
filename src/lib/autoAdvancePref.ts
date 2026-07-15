import { useSyncExternalStore } from "react";

/** 카드 완료 시 자동으로 다음 카드로 넘어갈지 — 세션 전역 설정. */

let autoAdvance = true;
const listeners = new Set<() => void>();

export function useAutoAdvancePref(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => autoAdvance,
    () => true, // SSR 기본값
  );
}

export function toggleAutoAdvance() {
  autoAdvance = !autoAdvance;
  listeners.forEach((fn) => fn());
}
