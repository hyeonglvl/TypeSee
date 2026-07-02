export type Pos = "n" | "v" | "adj" | "adv" | "phrase";

export interface WordSense {
  meaning: string;
  pos?: Pos;
}

export interface WordEntry {
  id: string;
  word: string;
  senses: WordSense[];
}

export type SessionMode = "typing" | "quiz";

export interface WordState {
  entry: WordEntry;
  typed: string;
  status: "pending" | "active" | "done";
  mistakes: number;
  mistakeStreak: number;
  lastMistakeAt: number | null;
  hintStage: number;
  hintedUpTo: number;
  /** This word is here because the user missed it before. */
  fromReview: boolean;
}

export interface SessionState {
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
  | { type: "NEXT_WORD" };

export interface SessionSummary {
  mode: SessionMode;
  totalWords: number;
  accuracy: number;
  elapsedMs: number;
  wpm: number;
  bestStreak: number;
  troubleWords: Array<{ entry: WordEntry; mistakes: number; hinted: boolean }>;
  /** Review words cleared without a single mistake or hint this session. */
  mastered: WordEntry[];
}
