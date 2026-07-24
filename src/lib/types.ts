export type Pos =
  | "n"
  | "v"
  | "adj"
  | "adv"
  | "prep"
  | "phrase"
  | "pron"
  | "conj"
  | "det"
  | "modal";

export interface WordSense {
  meaning: string;
  /** 한 뜻이 여러 품사를 겸할 수 있다 (예: prep+adv). */
  pos?: Pos[];
}

export interface WordEntry {
  id: string;
  word: string;
  senses: WordSense[];
  /** 소속 카테고리 id 목록 — 한 단어가 여러 카테고리에 속할 수 있다.
   *  id 의미는 src/data/index.ts 의 CATEGORIES 가 단일 소스. */
  category?: number[];
  /** 예문 목록 — exampleMeaning 과 인덱스로 짝을 이룬다.
   *  2개 이상이면 세션 카드가 랜덤으로 하나를 골라 보여준다. */
  example?: string[];
  /** 예문 한글 해석 목록 (example 과 순서 일치). */
  exampleMeaning?: string[];
}

export type SessionMode = "typing" | "quiz" | "listening";

export interface WordState {
  entry: WordEntry;
  typed: string;
  status: "pending" | "active" | "done";
  mistakes: number;
  lastMistakeAt: number | null;
  /** 글자 공개 경계 — 퀴즈 첫 글자 고스트와 Space 정답 보기가 사용한다. */
  hintedUpTo: number;
  /** Gave up via Space in quiz mode — completed as a miss, held longer so
   *  the revealed spelling can actually be read before advancing. */
  gaveUp: boolean;
  /** 힌트 보기로 글자를 열어봤다 — 결과 화면 라벨용. */
  hinted: boolean;
  /** 리스닝에서 뜻 보기를 눌렀다 — 결과 화면 라벨용. */
  meaningSeen: boolean;
  /** This word is here because the user missed it before. */
  fromReview: boolean;
  /** 마스터 유지 점검으로 뽑힌 단어 — 틀리면 복습 풀로 복귀한다. */
  isRetention: boolean;
}

export interface SessionState {
  mode: SessionMode;
  words: WordState[];
  currentIndex: number;
  startedAt: number;
  finishedAt: number | null;
  mistakes: number;
  correctKeystrokes: number;
  streak: number;
  lastCompletedId: string | null;
}

export type SessionAction =
  | { type: "TYPE_CHAR"; char: string }
  | { type: "BACKSPACE" }
  | { type: "PREV_WORD" }
  | { type: "NEXT_WORD" }
  | { type: "REVEAL" }
  | { type: "HINT" }
  | { type: "SHOW_MEANING" }
  | { type: "ADVANCE" };

/** 단어 하나의 세션 결과 3단계 — EF/복습 풀 갱신의 유일한 판정 기준.
 *  clean: 오타·힌트 없이 정답. minor: 정답이지만 오타가 있었거나 힌트를
 *  씀. major: 힌트를 썼어도 결국 오답, 또는 정답 보기(gaveUp). */
export type WordOutcomeTier = "clean" | "minor" | "major";

export interface SessionSummary {
  mode: SessionMode;
  totalWords: number;
  /** Words actually reached this session (status "done") — excludes words
   *  never reached on early exit. Drives the daily streak count. */
  wordsCompleted: number;
  /** Share of words (0–1) that had at least one mistake. */
  wrongRate: number;
  elapsedMs: number;
  wpm: number;
  /** Longest run of consecutive words typed with zero mistakes. */
  bestStreak: number;
  /** 다시 볼 단어 — 틀렸거나, 정답·힌트·뜻을 열어본 단어.
   *  mistakes 는 REVEAL 페널티를 뺀 실제 오타 수. */
  troubleWords: Array<{
    entry: WordEntry;
    mistakes: number;
    gaveUp: boolean;
    hinted: boolean;
    meaningSeen: boolean;
  }>;
  /** Review words cleared without a single mistake or hint this session. */
  mastered: WordEntry[];
  /** 마스터 유지 점검에서 틀린 단어 — 복습 풀로 복귀했다. */
  retentionMisses: Array<{ entry: WordEntry; mistakes: number }>;
  /** 단어별 EF/복습 풀 갱신 신호 — recordSession 에 그대로 넘긴다.
   *  clean 은 이미 복습 풀에 있던(fromReview) 단어에만 포함된다. */
  outcomes: Array<{ id: string; tier: WordOutcomeTier; revealed: boolean }>;
}