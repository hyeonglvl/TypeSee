import type { Pos, WordEntry } from "@/lib/types";
import { wordBoundaryMatch } from "@/lib/wordMatch";
import rawJson from "./wordjson.json";

/** 카테고리 정의 — id 는 wordjson.json 의 category 숫자와 일치하는 단일
 *  소스다. 홈 셀렉트·세션 필터가 모두 여기를 본다. */
export const CATEGORIES: Array<{
  id: number;
  label: string;
  /** 데이터가 아직 없어 선택 불가. */
  soon?: boolean;
}> = [
  { id: 0, label: "토익 400-600" },
  { id: 1, label: "토익 600-780" },
  { id: 2, label: "토익 780-900" },
  { id: 3, label: "토익 900+" },
  { id: 4, label: "일상용어" },
  { id: 5, label: "비즈니스 용어" },
  { id: 6, label: "과학 용어", soon: true },
];

export const DEFAULT_CATEGORY = 4; // 일상용어 — 기존 기본값(실생활) 승계

export const ALL_WORDS: WordEntry[] = rawJson as WordEntry[];

export function wordsInCategory(categoryId: number): WordEntry[] {
  return ALL_WORDS.filter((w) => w.category?.includes(categoryId));
}

/** 홈 셀렉트에서 빈 카테고리를 비활성화할 때 쓰는 단어 수. */
export const CATEGORY_COUNTS: ReadonlyMap<number, number> = new Map(
  CATEGORIES.map(({ id }) => [id, wordsInCategory(id).length]),
);

/** pos 문자열이 Pos 유니온에 속하는지 — wordjson 데이터 검증용 (dev 전용). */
const KNOWN_POS: ReadonlySet<string> = new Set([
  "n",
  "v",
  "adj",
  "adv",
  "prep",
  "phrase",
  "pron",
  "conj",
  "det",
  "modal",
] satisfies Pos[]);

if (process.env.NODE_ENV !== "production") {
  for (const w of ALL_WORDS) {
    const ex = w.example?.length ?? 0;
    const ko = w.exampleMeaning?.length ?? 0;
    if (ex !== ko)
      console.warn(`[TypeSee] ${w.id}: 예문(${ex})·해석(${ko}) 개수 불일치`);
    for (const s of w.senses)
      for (const p of s.pos ?? [])
        if (!KNOWN_POS.has(p))
          console.warn(`[TypeSee] ${w.id}: 알 수 없는 품사 "${p}"`);
    // 예문이 있는데 그중 어느 하나도 표제어와 경계(\b) 매칭이 안 되면
    // Session.tsx의 findWordSpan이 항상 실패해 예문 없이 단어만 표시된다
    // — "lying"처럼 굴절형만 쓰인 예문이 대표적인 원인.
    if (
      w.example &&
      w.example.length > 0 &&
      !w.example.some((sentence) => wordBoundaryMatch(w.word, sentence))
    )
      console.warn(`[TypeSee] ${w.id}: 예문 중 표제어("${w.word}") 경계 매칭 0건 — 항상 예문 없이 표시됨`);
  }
}
