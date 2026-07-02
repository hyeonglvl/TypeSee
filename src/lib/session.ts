import type {
  CardGeometry,
  SessionAction,
  SessionState,
  SessionSummary,
  SessionWordState,
  WordEntry,
} from "@/lib/types";

const MISTAKES_FOR_HINT = 2;
const LONG_WORD_LENGTH = 7;

export function createInitialSessionState(words: WordEntry[]): SessionState {
  return {
    words: words.map((entry) => ({
      entry,
      typed: "",
      status: "pending",
      lastMistakeAt: null,
      mistakeStreak: 0,
      hintedUpTo: 0,
      hintStage: 0,
    })),
    currentIndex: 0,
    startedAt: Date.now(),
    mistakes: 0,
    correctKeystrokes: 0,
    finishedAt: null,
  };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  if (state.finishedAt !== null) return state;

  if (action.type === "PREV_WORD") {
    if (state.currentIndex === 0) return state;
    return { ...state, currentIndex: state.currentIndex - 1 };
  }

  if (action.type === "NEXT_WORD") {
    if (state.currentIndex === state.words.length - 1) return state;
    return { ...state, currentIndex: state.currentIndex + 1 };
  }

  const activeWord = state.words[state.currentIndex];
  if (!activeWord) return state;

  if (action.type === "BACKSPACE") {
    if (activeWord.typed.length === 0) return state;
    const words = state.words.slice();
    words[state.currentIndex] = {
      ...activeWord,
      typed: activeWord.typed.slice(0, -1),
      mistakeStreak: 0,
    };
    return { ...state, words };
  }

  // TYPE_CHAR
  const target = activeWord.entry.word;
  const nextCharIndex = activeWord.typed.length;
  const isCorrect = action.char === target[nextCharIndex];

  if (!isCorrect) {
    const mistakeStreak = activeWord.mistakeStreak + 1;
    const triggerHint =
      mistakeStreak >= MISTAKES_FOR_HINT && activeWord.hintStage < 2;
    const hintStage = triggerHint
      ? activeWord.hintStage + 1
      : activeWord.hintStage;
    const firstHintReveal = target.length >= LONG_WORD_LENGTH ? 2 : 1;
    const hintedUpTo = triggerHint
      ? hintStage >= 2
        ? target.length
        : Math.max(
            activeWord.hintedUpTo,
            Math.min(target.length, nextCharIndex + firstHintReveal)
          )
      : activeWord.hintedUpTo;
    const words = state.words.slice();
    words[state.currentIndex] = {
      ...activeWord,
      lastMistakeAt: Date.now(),
      mistakeStreak: triggerHint ? 0 : mistakeStreak,
      hintedUpTo,
      hintStage,
    };
    return { ...state, words, mistakes: state.mistakes + 1 };
  }

  const typed = activeWord.typed + action.char;
  const wordDone = typed.length === target.length;
  const words = state.words.slice();
  words[state.currentIndex] = {
    ...activeWord,
    typed,
    status: wordDone ? "done" : "active",
    mistakeStreak: 0,
  };

  const isLastWord = state.currentIndex === state.words.length - 1;
  const currentIndex =
    wordDone && !isLastWord ? state.currentIndex + 1 : state.currentIndex;
  const finishedAt = wordDone && isLastWord ? Date.now() : state.finishedAt;

  return {
    ...state,
    words,
    currentIndex,
    correctKeystrokes: state.correctKeystrokes + 1,
    finishedAt,
  };
}

function computeGeometry(offset: number): CardGeometry {
  const role = offset < 0 ? "completed" : offset === 0 ? "active" : "upcoming";
  const translateXPercent = offset * 22;
  const scale = offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.62 : 0.42;
  return { role, offset, translateXPercent, scale };
}

export function getVisibleCards(
  state: SessionState,
  window = 2
): Array<{ word: SessionWordState; geometry: CardGeometry }> {
  const { words, currentIndex } = state;
  const start = Math.max(0, currentIndex - window);
  const end = Math.min(words.length - 1, currentIndex + window);
  const visible: Array<{ word: SessionWordState; geometry: CardGeometry }> = [];
  for (let i = start; i <= end; i++) {
    visible.push({ word: words[i], geometry: computeGeometry(i - currentIndex) });
  }
  return visible;
}

export function summarize(state: SessionState): SessionSummary {
  const totalWords = state.words.length;
  const totalKeystrokes = state.correctKeystrokes + state.mistakes;
  const accuracy =
    totalKeystrokes === 0 ? 1 : state.correctKeystrokes / totalKeystrokes;
  const elapsedMs = (state.finishedAt ?? Date.now()) - state.startedAt;
  const wordsPerMinute =
    elapsedMs === 0 ? 0 : (totalWords / elapsedMs) * 60000;
  return { totalWords, accuracy, elapsedMs, wordsPerMinute };
}

export function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
