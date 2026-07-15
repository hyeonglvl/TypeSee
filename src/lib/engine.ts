import type {
  SessionAction,
  SessionMode,
  SessionState,
  SessionSummary,
  WordEntry,
  WordOutcomeTier,
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
        hinted: false,
        meaningSeen: false,
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

    case "HINT": {
      // 힌트 보기: 앞 글자를 짧은 단어(≤5자)는 1개, 긴 단어는 2개씩 더
      // 공개한다. 마지막 글자는 힌트로 열리지 않는다 — 전부 보는 건
      // REVEAL(정답 보기)의 몫.
      const active = state.words[state.currentIndex];
      if (active.status === "done") return state;
      const len = active.entry.word.length;
      const step = len <= 5 ? 1 : 2;
      // 퀴즈는 첫 글자가 기본 공개라 그 뒤부터 연다. 이미 입력해버린
      // 글자(맞았든 틀렸든)는 힌트가 새로 열어줄 필요가 없으니, 커서
      // 위치(typed.length)보다는 항상 앞서서 다음 글자를 공개한다 —
      // 안 그러면 입력이 힌트 경계를 앞질렀을 때 힌트가 이미 지나간
      // 자리만 가리켜서 눌러도 아무 효과가 없어 보인다.
      const base = Math.max(
        active.hintedUpTo,
        active.typed.length,
        state.mode === "quiz" ? 1 : 0,
      );
      const hintedUpTo = Math.min(len - 1, base + step);
      if (hintedUpTo <= active.hintedUpTo && active.hinted) return state;
      return replaceActive(state, {
        ...active,
        hintedUpTo: Math.max(hintedUpTo, active.hintedUpTo),
        hinted: true,
      });
    }

    case "SHOW_MEANING": {
      // 리스닝 '뜻 보기' — 표시 자체는 화면 상태고, 여기서는 열어봤다는
      // 사실만 남긴다 (결과 화면 라벨용).
      const active = state.words[state.currentIndex];
      if (active.status === "done" || active.meaningSeen) return state;
      return replaceActive(state, { ...active, meaningSeen: true });
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

/** 단어 하나의 세션 결과를 3단계로 분류한다 — EF/복습 풀 갱신의 유일한 판정
 *  기준. status==='done'인 단어에만 호출한다(미완료 단어는 typed 가 정답과
 *  다를 수밖에 없어 판정이 무의미하다).
 *  Typing 모드는 오타 시 커서가 막혀 typed 가 항상 정답과 일치하므로 구조상
 *  major 가 나오지 않는다(clean/minor만). */
export function classify(word: WordState): WordOutcomeTier {
  if (word.gaveUp) return "major";
  const correct = word.typed.toLowerCase() === word.entry.word.toLowerCase();
  if (!correct) return "major";
  if (word.hinted || word.mistakes > 0) return "minor";
  return "clean";
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

  // 다시 볼 단어: 틀린 단어에 더해 힌트·뜻을 열어본 단어도 라벨과 함께
  // 올린다. mistakes 는 REVEAL 페널티 1회를 빼고 실제 오타만 남긴다.
  const troubleWords = state.words
    .filter((w) => w.mistakes > 0 || w.hinted || w.meaningSeen)
    .sort((a, b) => b.mistakes - a.mistakes)
    .map((w) => ({
      entry: w.entry,
      mistakes: w.mistakes - (w.gaveUp ? 1 : 0),
      gaveUp: w.gaveUp,
      hinted: w.hinted,
      meaningSeen: w.meaningSeen,
    }));

  const doneWords = state.words.filter((w) => w.status === "done");
  const tiered = doneWords.map((w) => ({ word: w, tier: classify(w) }));

  // EF/복습 풀 갱신용. clean 은 이미 풀에 있던(fromReview) 단어만 포함한다 —
  // 풀에 없던 새 단어의 clean 통과는 올릴 ease 가 애초에 없다(recordSession
  // 의 `if (!cur) continue` 가드로도 걸러지지만, 여기서 미리 제외해야
  // Supabase 삭제 쿼리에 무관한 id 가 섞여 들어가지 않는다).
  const outcomes = tiered
    .filter(({ word, tier }) => tier !== "clean" || word.fromReview)
    .map(({ word, tier }) => ({
      id: word.entry.id,
      tier,
      revealed: word.gaveUp,
    }));

  // 정타 통과: 복습 출신 단어를 오타·힌트 없이 완주 — TS-1 에서 ease 를
  // 올리는 신호가 된다.
  const mastered = tiered
    .filter(({ word, tier }) => tier === "clean" && word.fromReview)
    .map(({ word }) => word.entry);

  // 마스터 유지 점검 실패 — recordSession 이 복습 풀로 강등한 단어들.
  const retentionMisses = tiered
    .filter(({ word, tier }) => word.isRetention && tier !== "clean")
    .map(({ word }) => ({ entry: word.entry, mistakes: word.mistakes }));

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
    outcomes,
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
