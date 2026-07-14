import type {
  SessionAction,
  SessionMode,
  SessionState,
  SessionSummary,
  WordEntry,
  WordState,
} from "./types";


export function createSession(
  words: WordEntry[],
  mode: SessionMode,
  reviewIds?: ReadonlySet<string>,
  retentionIds?: ReadonlySet<string>,
): SessionState {
  return {
    mode,
    words: words.map(
      (entry): WordState => ({
        entry,
        typed: "",
        status: "pending",
        mistakes: 0,
        lastMistakeAt: null,
        hintedUpTo: 0,
        gaveUp: false,
        fromReview: reviewIds?.has(entry.id) ?? false,
        isRetention: retentionIds?.has(entry.id) ?? false,
      }),
    ),
    currentIndex: 0,
    startedAt: Date.now(),
    finishedAt: null,
    mistakes: 0,
    correctKeystrokes: 0,
    streak: 0,
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
      // Space in quiz mode: give up on this word. Reveal the spelling,
      // count it as a miss, and complete it — a longer hold (driven by
      // `gaveUp`) gives the user time to actually read it before ADVANCE.
      const active = state.words[state.currentIndex];
      if (active.status === "done") return state;
      return {
        ...replaceActive(state, {
          ...active,
          hintedUpTo: active.entry.word.length,
          status: "done",
          mistakes: active.mistakes + 1,
          gaveUp: true,
          lastMistakeAt: Date.now(),
        }),
        mistakes: state.mistakes + 1,
        streak: 0,
        lastCompletedId: active.entry.id,
      };
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
      const correct = action.char === target[at];

      // Quiz/Listening mode tests spelling recall — every keystroke lands and
      // the cursor always advances, right or wrong, instead of blocking until
      // the correct letter is found (that's what Typing mode is for).
      if (state.mode !== "typing") {
        const typed = active.typed + action.char;
        const done = typed.length === target.length;
        const streak = correct ? state.streak + 1 : 0;

        return {
          ...replaceActive(state, {
            ...active,
            typed,
            status: done ? "done" : "active",
            mistakes: correct ? active.mistakes : active.mistakes + 1,
            lastMistakeAt: correct ? active.lastMistakeAt : Date.now(),
          }),
          correctKeystrokes: correct
            ? state.correctKeystrokes + 1
            : state.correctKeystrokes,
          mistakes: correct ? state.mistakes : state.mistakes + 1,
          streak,
          lastCompletedId: done ? active.entry.id : state.lastCompletedId,
        };
      }

      if (!correct) {
        return {
          ...replaceActive(state, {
            ...active,
            mistakes: active.mistakes + 1,
            lastMistakeAt: Date.now(),
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
        }),
        correctKeystrokes: state.correctKeystrokes + 1,
        streak,
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

export function summarize(state: SessionState): SessionSummary {
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
    .filter((w) => w.mistakes > 0)
    .sort((a, b) => b.mistakes - a.mistakes)
    .map((w) => ({
      entry: w.entry,
      mistakes: w.mistakes,
      gaveUp: w.gaveUp,
    }));

  // 정타 통과: 복습 출신 단어를 오타 없이 완주 (Space 정답 보기는 오타로
  // 세므로 자동 제외) — TS-1 에서 ease 를 올리는 신호가 된다.
  const mastered = state.words
    .filter((w) => w.fromReview && w.status === "done" && w.mistakes === 0)
    .map((w) => w.entry);

  // 마스터 유지 점검 실패 — recordSession 이 복습 풀로 강등한 단어들.
  const retentionMisses = state.words
    .filter((w) => w.isRetention && w.mistakes > 0)
    .map((w) => ({ entry: w.entry, mistakes: w.mistakes }));

  return {
    mode: state.mode,
    totalWords: state.words.length,
    wordsCompleted: state.words.filter((w) => w.status === "done").length,
    wrongRate,
    elapsedMs,
    wpm,
    bestStreak: bestWordStreak,
    troubleWords,
    mastered,
    retentionMisses,
  };
}

/** TS-1: 가중 무작위 추출(비복원) — weight 가 클수록 뽑힐 확률이 높다. */
export function weightedSample<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  n: number,
): T[] {
  const pool = items.slice();
  const weights = pool.map((item) => Math.max(weightOf(item), 0.0001));
  const picked: T[] = [];
  while (picked.length < n && pool.length > 0) {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= weights[i];
      if (r <= 0) break;
    }
    picked.push(pool[i]);
    pool.splice(i, 1);
    weights.splice(i, 1);
  }
  return picked;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
