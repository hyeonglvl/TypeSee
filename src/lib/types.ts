export interface WordSense {
  meaning: string;
  pos?: "n" | "v" | "adj" | "adv" | "phrase";
}

export interface WordEntry {
  id: string;
  word: string;
  senses: WordSense[];
}

export type SessionMode = "typing" | "quiz";

export type CardRole = "completed" | "active" | "upcoming";

export interface SessionWordState {
  entry: WordEntry;
  typed: string;
  status: "pending" | "active" | "done";
  lastMistakeAt: number | null;
  mistakeStreak: number;
  hintedUpTo: number;
  hintStage: number;
}

export interface SessionState {
  words: SessionWordState[];
  currentIndex: number;
  startedAt: number;
  mistakes: number;
  correctKeystrokes: number;
  finishedAt: number | null;
}

export type SessionAction =
  | { type: "TYPE_CHAR"; char: string }
  | { type: "BACKSPACE" }
  | { type: "PREV_WORD" }
  | { type: "NEXT_WORD" };

export interface CardGeometry {
  role: CardRole;
  offset: number;
  translateXPercent: number;
  scale: number;
}

export interface SessionSummary {
  totalWords: number;
  accuracy: number;
  elapsedMs: number;
  wordsPerMinute: number;
}
