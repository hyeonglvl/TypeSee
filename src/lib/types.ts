export type Pos = "n" | "v" | "adj" | "adv" | "phrase";

export interface WordSense {
  meaning: string;
  pos?: Pos;
}

export interface WordEntry {
  id: string;
  word: string;
  senses: WordSense[];
  /** 심플한 예문 한 문장 (추후 표시 기능 예정). */
  example?: string;
  /** 예문의 한글 해석. */
  exampleMeaning?: string;
}

export type SessionMode = "typing" | "quiz";

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
  /** This word is here because the user missed it before. */
  fromReview: boolean;
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
  bestStreak: number;
  lastCompletedId: string | null;
}

export type SessionAction =
  | { type: "TYPE_CHAR"; char: string }
  | { type: "BACKSPACE" }
  | { type: "PREV_WORD" }
  | { type: "NEXT_WORD" }
  | { type: "REVEAL" }
  | { type: "ADVANCE" };

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
  troubleWords: Array<{ entry: WordEntry; mistakes: number; gaveUp: boolean }>;
  /** Review words cleared without a single mistake or hint this session. */
  mastered: WordEntry[];
} 