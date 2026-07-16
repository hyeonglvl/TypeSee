import { useSyncExternalStore } from "react";
import { CATEGORIES, CATEGORY_COUNTS, DEFAULT_CATEGORY } from "@/data";

/** 홈 화면의 카테고리·단어 수 선택 — 세션을 다녀와도(홈 리마운트) 유지되고
 *  localStorage 백업으로 재방문 때도 복원된다. */

export interface HomePrefs {
  category: number;
  count: number;
}

const STORAGE_KEY = "typesee:home-prefs";
const DEFAULTS: HomePrefs = { category: DEFAULT_CATEGORY, count: 10 };

const listeners = new Set<() => void>();
let prefs: HomePrefs = DEFAULTS;
let hydrated = false;

export function useHomePrefs(): HomePrefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => prefs,
    () => DEFAULTS, // SSR 기본값
  );
}

export function setHomePrefs(
  next: Partial<HomePrefs> | ((prev: HomePrefs) => Partial<HomePrefs>),
) {
  const patch = typeof next === "function" ? next(prefs) : next;
  prefs = { ...prefs, ...patch };
  listeners.forEach((fn) => fn());
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 저장 공간 부족 등 — 이번 세션 동안만 유지된다
  }
}

/** App 마운트 직후 1회 — localStorage 백업을 읽어온다. 저장 후 카테고리가
 *  비거나(soon) 단어 수가 줄었을 수 있어 되살릴 때 다시 검증한다. */
export function hydrateHomePrefs() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<HomePrefs>;
    const cat = CATEGORIES.find((c) => c.id === saved.category);
    const category =
      cat && !cat.soon && (CATEGORY_COUNTS.get(cat.id) ?? 0) > 0
        ? cat.id
        : DEFAULTS.category;
    const max = Math.max(CATEGORY_COUNTS.get(category) ?? 0, 1);
    const count = Number.isInteger(saved.count)
      ? Math.min(max, Math.max(1, saved.count as number))
      : DEFAULTS.count;
    prefs = { category, count };
    listeners.forEach((fn) => fn());
  } catch {
    // 손상된 백업은 버린다
  }
}
