import type {
  SessionAction,
  SessionMode,
  SessionState,
  SessionSummary,
  WordEntry,
  WordState,
} from "./types";

const MISTAKES_FOR_HINT = 2;
const LONG_WORD_LENGTH = 7;

export function createSession(
  words: WordEntry[],
  reviewIds?: ReadonlySet<string>,
): SessionState {
  return {
    words: words.map(
      (entry): WordState => ({
        entry,
        typed: "",
        status: "pending",
        mistakes: 0,
        mistakeStreak: 0,
        lastMistakeAt: null,
        hintStage: 0,
        hintedUpTo: 0,
        fromReview: reviewIds?.has(entry.id) ?? false,
      }),
    ),
    currentIndex: 0,
    startedAt: Date.now(),
    finishedAt: null,
    mistakes: 0,
    correctKeystrokes: 0,
    streak: 0,
    bestStreak: 0,
    lastCompletedId: null,
  };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  if (state.finishedAt !== null) return state;

  switch (action.type) {
    case "REVEAL": {
      const active = state.words[state.currentIndex];
      return replaceActive(state, {
        ...active,
        hintedUpTo: active.entry.word.length,
      });
    }

    case "PREV_WORD":
      return state.currentIndex === 0
        ? state
        : { ...state, currentIndex: state.currentIndex - 1 };

    case "NEXT_WORD":
      return state.currentIndex === state.words.length - 1
        ? state
        : { ...state, currentIndex: state.currentIndex + 1 };

    case "BACKSPACE": {
      const active = state.words[state.currentIndex];
      if (active.typed.length === 0) return state;
      return replaceActive(state, {
        ...active,
        typed: active.typed.slice(0, -1),
        mistakeStreak: 0,
      });
    }

    case "ADVANCE": {
      const isLast = state.currentIndex === state.words.length - 1;
      return {
        ...state,
        currentIndex: isLast ? state.currentIndex : state.currentIndex + 1,
        finishedAt: isLast ? Date.now() : state.finishedAt,
      };
    }

    case "TYPE_CHAR": {
      const active = state.words[state.currentIndex];
      // Word already completed — holding here for the brief pause before
      // ADVANCE fires; ignore stray keystrokes instead of miscounting them.
      if (active.status === "done") return state;
      const target = active.entry.word;
      const at = active.typed.length;

      if (action.char !== target[at]) {
        const mistakeStreak = active.mistakeStreak + 1;
        const triggerHint =
          mistakeStreak >= MISTAKES_FOR_HINT && active.hintStage < 2;
        const hintStage = triggerHint ? active.hintStage + 1 : active.hintStage;
        const firstReveal = target.length >= LONG_WORD_LENGTH ? 2 : 1;
        const hintedUpTo = triggerHint
          ? hintStage >= 2
            ? target.length
            : Math.max(active.hintedUpTo, Math.min(target.length, at + firstReveal))
          : active.hintedUpTo;

        return {
          ...replaceActive(state, {
            ...active,
            mistakes: active.mistakes + 1,
            mistakeStreak: triggerHint ? 0 : mistakeStreak,
            lastMistakeAt: Date.now(),
            hintStage,
            hintedUpTo,
          }),
          mistakes: state.mistakes + 1,
          streak: 0,
        };
      }

      const typed = active.typed + action.char;
      const done = typed.length === target.length;
      const streak = state.streak + 1;

      return {
        ...replaceActive(state, {
          ...active,
          typed,
          status: done ? "done" : "active",
          mistakeStreak: 0,
        }),
        correctKeystrokes: state.correctKeystrokes + 1,
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        lastCompletedId: done ? active.entry.id : state.lastCompletedId,
      };
    }
  }
}

function replaceActive(state: SessionState, next: WordState): SessionState {
  const words = state.words.slice();
  words[state.currentIndex] = next;
  return { ...state, words };
}

export function summarize(state: SessionState, mode: SessionMode): SessionSummary {
  const wrongWords = state.words.filter((w) => w.mistakes > 0).length;
  const wrongRate =
    state.words.length === 0 ? 0 : wrongWords / state.words.length;

  let wordStreak = 0;
  let bestWordStreak = 0;
  for (const w of state.words) {
    if (w.mistakes === 0) {
      wordStreak++;
      bestWordStreak = Math.max(bestWordStreak, wordStreak);
    } else {
      wordStreak = 0;
    }
  }

  const elapsedMs = (state.finishedAt ?? Date.now()) - state.startedAt;
  // Standard WPM: 5 keystrokes = 1 word
  const wpm =
    elapsedMs === 0 ? 0 : (state.correctKeystrokes / 5 / elapsedMs) * 60000;

  const troubleWords = state.words
    .filter((w) => w.mistakes > 0 || w.hintStage > 0)
    .sort((a, b) => b.mistakes - a.mistakes)
    .map((w) => ({
      entry: w.entry,
      mistakes: w.mistakes,
      hinted: w.hintStage > 0,
    }));

  const mastered = state.words
    .filter(
      (w) =>
        w.fromReview &&
        w.status === "done" &&
        w.mistakes === 0 &&
        w.hintStage === 0,
    )
    .map((w) => w.entry);

  return {
    mode,
    totalWords: state.words.length,
    wrongRate,
    elapsedMs,
    wpm,
    bestStreak: bestWordStreak,
    troubleWords,
    mastered,
  };
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
