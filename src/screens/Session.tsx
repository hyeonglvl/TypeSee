import { memo, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createSession, sessionReducer, summarize } from "@/lib/engine";
import { ensureSoundOn, speak, toggleSound, useSoundPref } from "@/lib/tts";
import {
  toggleAutoAdvance,
  useAutoAdvancePref,
} from "@/lib/autoAdvancePref";
import { useDifficultyPref, type Difficulty } from "@/lib/difficultyPref";
import {
  easeStage,
  saveWord,
  useReviewPool,
  type EaseStageTone,
} from "@/lib/reviewStore";
import type {
  Pos,
  SessionMode,
  SessionSummary,
  WordEntry,
  WordState,
} from "@/lib/types";
import styles from "./Session.module.css";

interface Props {
  words: WordEntry[];
  mode: SessionMode;
  reviewIds: ReadonlySet<string>;
  /** 마스터 유지 점검으로 섞인 단어 — 배지 없이 출제되고 틀리면 풀로 복귀. */
  retentionIds: ReadonlySet<string>;
  onFinish: (summary: SessionSummary) => void;
  onExit: (summary: SessionSummary) => void;
}

const POS_LABEL: Record<Pos, string> = {
  n: "명사",
  v: "동사",
  adj: "형용사",
  adv: "부사",
  prep: "전치사",
  phrase: "구",
  pron: "대명사",
  conj: "접속사",
  det: "한정사",
  modal: "조동사",
};

const WINDOW = 2;
const FINISH_HOLD_MS = 700;
const ADVANCE_HOLD_MS = 500;
const GIVE_UP_HOLD_MS = 1500;
// 리스닝은 맞힌 뒤에야 뜻이 보인다 — 읽을 시간을 주되 정답 봄(1.5초)보다는
// 0.5초 빠르게 넘긴다.
const LISTENING_ADVANCE_HOLD_MS = 1000;

const cardSpring = { type: "spring", stiffness: 280, damping: 30 } as const;

const STAGE_CLASS: Record<EaseStageTone, string> = {
  weak: styles.stageWeak,
  wary: styles.stageWary,
  stable: styles.stageStable,
  done: styles.stageDone,
};

/* 한국어 IME가 켜진 채 타이핑해도 영어가 입력되게, e.key 대신 물리 키
   위치(e.code)에서 문자를 복원한다. 한글 2벌식은 QWERTY 배열 그대로라
   ㅁ(KeyA) → "a" 처럼 안전하게 매핑된다. */
const CODE_TO_CHAR: Record<string, string> = {
  Minus: "-",
  Quote: "'",
  Period: ".",
  Comma: ",",
};
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(97 + i);
  CODE_TO_CHAR[`Key${letter.toUpperCase()}`] = letter;
}

function charFromKeydown(e: KeyboardEvent): string | null {
  // ASCII 문자가 그대로 오면 신뢰 (영문 자판, 특수 배열 모두 존중)
  if (e.key.length === 1 && e.key.charCodeAt(0) < 128) return e.key;
  // 한글("ㅁ")이나 "Process" 등 IME 산출물이면 물리 키에서 복원
  const base = CODE_TO_CHAR[e.code];
  if (!base) return null;
  return e.shiftKey ? base.toUpperCase() : base;
}

export default function SessionScreen({
  words,
  mode,
  reviewIds,
  retentionIds,
  onFinish,
  onExit,
}: Props) {
  const [state, dispatch] = useReducer(sessionReducer, null, () =>
    createSession(words, mode, reviewIds, retentionIds),
  );
  const soundOn = useSoundPref();
  const autoAdvance = useAutoAdvancePref();
  const difficulty = useDifficultyPref();
  const pool = useReviewPool(); // 복습 배지 + 익힘 단계 점 표시용
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const exit = () => onExitRef.current(summarize(stateRef.current));

  // 정답 보기(퀴즈·리스닝의 포기) — 예전엔 space 였고, 지금은 숫자 단축키·
  // 액션 버튼 전용이다. 북마크(저장)는 건드리지 않는다 — "정답 봄" 라벨과
  // EF 하락은 세션 종료 시 summarize()/recordSession 이 처리한다.
  const revealAnswer = () => {
    dispatch({ type: "REVEAL" });
  };

  // 단어 저장(북마크) — 타이핑 모드 전용, 예전엔 space 였고 지금은 "1".
  const saveCurrent = () => {
    const id = stateRef.current.words[stateRef.current.currentIndex].entry.id;
    saveWord(id);
    setSavedIds((prev) => new Set(prev).add(id));
  };

  // space 의 새 역할: 완료된 카드만 다음으로 넘긴다 — 자동 넘기기가 꺼져
  // 있을 때의 주 조작이자, 켜져 있을 때는 대기 시간을 건너뛰는 단축키.
  const nextCard = () => {
    const current = stateRef.current.words[stateRef.current.currentIndex];
    if (current.status !== "done") return;
    dispatch({ type: "ADVANCE" });
  };

  const replayCurrent = () => {
    const current =
      stateRef.current.words[stateRef.current.currentIndex];
    if (current) speak(current.entry.word);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "BACKSPACE" });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        dispatch({ type: "PREV_WORD" });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        dispatch({ type: "NEXT_WORD" });
      } else if (e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        nextCard();
      } else if (e.key === "Tab" && mode === "listening") {
        e.preventDefault();
        if (e.repeat) return;
        replayCurrent();
      } else if (e.key >= "0" && e.key <= "9") {
        // 숫자는 글자로 입력받지 않는다 — 모드별 액션 단축키 전용
        e.preventDefault();
        if (e.repeat) return;
        if (mode === "quiz") {
          if (e.key === "1") dispatch({ type: "HINT" });
          else if (e.key === "2") revealAnswer();
        } else if (mode === "listening") {
          if (e.key === "1") toggleMeaning();
          else if (e.key === "2") dispatch({ type: "HINT" });
          else if (e.key === "3") revealAnswer();
        } else if (mode === "typing") {
          if (e.key === "1") saveCurrent();
        }
      } else {
        const char = charFromKeydown(e);
        if (char === null) return;
        // Suppressed here so the character never lands in the hidden mobile
        // input too — on iOS/desktop keyboards this preventDefault stops the
        // input's native insertion, so the onChange-based path below never
        // double-fires for the same key.
        e.preventDefault();
        dispatch({ type: "TYPE_CHAR", char });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 리스닝은 소리가 꺼져 있으면 성립하지 않는다 — 세션 시작 시 강제로 켠다.
  // (진입-발화 effect 보다 먼저 실행되어야 첫 단어가 들린다.)
  useEffect(() => {
    if (mode === "listening") ensureSoundOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 리스닝: 카드에 진입하는 순간 발음을 들려준다 (문제 출제)
  useEffect(() => {
    if (mode !== "listening") return;
    const current = state.words[state.currentIndex];
    if (!current || current.status === "done") return;
    speak(current.entry.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentIndex]);

  // 리스닝 '뜻 보기' — 카드가 넘어가면 다시 닫힌다.
  // 키보드 핸들러(deps [])에서도 토글할 수 있게 ref 로도 함께 든다.
  const [meaningShown, setMeaningShown] = useState(false);
  const meaningShownRef = useRef(false);
  useEffect(() => {
    meaningShownRef.current = false;
    setMeaningShown(false);
  }, [state.currentIndex]);

  const toggleMeaning = () => {
    if (!meaningShownRef.current) dispatch({ type: "SHOW_MEANING" });
    meaningShownRef.current = !meaningShownRef.current;
    setMeaningShown(meaningShownRef.current);
  };

  // Focus a hidden input so mobile browsers show the on-screen keyboard —
  // without a focused input element, no software keyboard ever appears.
  useEffect(() => {
    mobileInputRef.current?.focus();
  }, []);

  const focusMobileInput = () => mobileInputRef.current?.focus();

  // Fallback path for software keyboards (mainly Android/Gboard) whose
  // composition sends keydown as "Unidentified" — the real character still
  // lands in the input's value via the native input event, so read it here.
  const handleMobileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chars = e.target.value;
    e.target.value = "";
    if (chars.length === 0) return;
    for (const char of chars) {
      if (char === " ") nextCard();
      // 숫자는 단축키 전용이라 글자로 넣지 않고, 한글 등 비 ASCII 문자는
      // IME 조합 산출물 — 어느 쪽도 오답으로 세지 않고 무시
      else if (char >= "0" && char <= "9") continue;
      else if (char.charCodeAt(0) < 128) dispatch({ type: "TYPE_CHAR", char });
    }
  };

  // Pronounce a word the moment it's completed
  useEffect(() => {
    if (state.lastCompletedId === null) return;
    const completed = words.find((w) => w.id === state.lastCompletedId);
    if (completed) speak(completed.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastCompletedId]);

  // Hold on the completed word briefly before moving on, instead of
  // snapping to the next one the instant the last letter lands. A word
  // given up on (quiz mode, Space) gets a longer hold so the revealed
  // spelling can actually be read.
  useEffect(() => {
    if (state.lastCompletedId === null) return;
    if (!autoAdvance) return; // 꺼져 있으면 space(또는 버튼)로만 넘어간다
    const completed = state.words.find(
      (w) => w.entry.id === state.lastCompletedId,
    );
    const delay = completed?.gaveUp
      ? GIVE_UP_HOLD_MS
      : mode === "listening"
        ? LISTENING_ADVANCE_HOLD_MS
        : ADVANCE_HOLD_MS;
    const t = setTimeout(() => dispatch({ type: "ADVANCE" }), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastCompletedId, autoAdvance]);

  const finished = state.finishedAt !== null;
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(
      () => onFinish(summarize(state)),
      FINISH_HOLD_MS,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const total = state.words.length;
  const doneCount = state.words.reduce(
    (n, w) => n + (w.status === "done" ? 1 : 0),
    0,
  );

  const keystrokes = state.correctKeystrokes + state.mistakes;
  const liveAccuracy =
    keystrokes === 0 ? null : state.correctKeystrokes / keystrokes;
  const elapsedMin = (Date.now() - state.startedAt) / 60000;
  const liveWpm =
    keystrokes < 5 || elapsedMin === 0
      ? null
      : state.correctKeystrokes / 5 / elapsedMin;

  const first = Math.max(0, state.currentIndex - WINDOW);
  const last = Math.min(total - 1, state.currentIndex + WINDOW);
  const visible = state.words.slice(first, last + 1);

  // 자동 넘기기가 꺼진 채 카드가 완료되면 다음으로 넘길 방법이 space
  // 뿐이라, 놓치지 않게 액션 바에 큼직한 버튼으로도 보여준다.
  const showNextCardButton =
    !autoAdvance && state.words[state.currentIndex]?.status === "done";

  return (
    <div className={styles.screen} onClick={focusMobileInput}>
      <input
        ref={mobileInputRef}
        className={styles.mobileInput}
        onChange={handleMobileInput}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-hidden="true"
        tabIndex={-1}
      />
      <motion.div
        className={styles.progressFill}
        animate={{ width: `${(doneCount / total) * 100}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 36 }}
      />

      <header className={styles.topBar}>
        <button type="button" className={styles.exitButton} onClick={exit}>
          <kbd>esc</kbd> 나가기
        </button>

        <span className={styles.liveStats}>
          {liveWpm !== null && (
            <span className={styles.liveStat}>
              <span className={styles.liveValue}>{Math.round(liveWpm)}</span>
              WPM
            </span>
          )}
          {liveAccuracy !== null && (
            <span className={styles.liveStat}>
              <span className={styles.liveValue}>
                {Math.round(liveAccuracy * 100)}%
              </span>
              정확도
            </span>
          )}
        </span>

        <span className={styles.topRight}>
          <button
            type="button"
            className={styles.autoAdvanceToggle}
            aria-label="자동 넘기기"
            aria-pressed={autoAdvance}
            onClick={toggleAutoAdvance}
          >
            자동 넘기기
            <span
              className={styles.switchTrack}
              data-on={autoAdvance ? "true" : "false"}
            >
              <span className={styles.switchThumb} />
            </span>
          </button>
          <button
            type="button"
            className={styles.soundToggle}
            aria-label={soundOn ? "발음 끄기" : "발음 켜기"}
            aria-pressed={soundOn}
            onClick={toggleSound}
          >
            <SpeakerIcon muted={!soundOn} />
          </button>
          <span className={styles.counter}>
            {doneCount} / {total}
          </span>
        </span>
      </header>

      <div className={styles.mobileCounter}>
        {doneCount} / {total}
      </div>

      <div className={styles.track}>
        <AnimatePresence initial={false}>
          {visible.map((word, i) => {
            // 해당되는 상태는 전부 나열한다 — 틀렸던 단어이면서 저장한
            // 단어일 수도 있다.
            const isSaved =
              savedIds.has(word.entry.id) ||
              (word.fromReview && pool.isSaved(word.entry.id));
            const wrongReview =
              word.fromReview && pool.wrongCountOf(word.entry.id) > 0;
            // 익힘 단계는 복습 풀에 있는(기록 있는) 단어에만 붙인다.
            // 마스터 유지 점검 단어는 블라인드 점검이라 표시하지 않는다.
            const stage = pool.ids.has(word.entry.id)
              ? easeStage(pool.easeOf(word.entry.id))
              : null;
            return (
              <WordCard
                key={word.entry.id}
                word={word}
                offset={first + i - state.currentIndex}
                mode={mode}
                difficulty={difficulty}
                wrongReview={wrongReview}
                saved={isSaved}
                stage={stage}
                justCompleted={state.lastCompletedId === word.entry.id}
                showMeaning={
                  meaningShown && first + i === state.currentIndex
                }
              />
            );
          })}
        </AnimatePresence>
      </div>

      <div className={styles.nextCardRow}>
        {showNextCardButton && (
          <button
            type="button"
            className={`${styles.actionButton} ${styles.nextCardButton}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={nextCard}
          >
            다음 카드 <kbd>space</kbd>
          </button>
        )}
      </div>

      <div className={styles.actionBar}>
        {mode === "listening" && (
          <button
            type="button"
            className={styles.actionButton}
            // 숨은 모바일 입력의 포커스를 뺏어 키보드가 닫히지 않게
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleMeaning}
          >
            {meaningShown ? "뜻 감추기" : "뜻 보기"} <kbd>1</kbd>
          </button>
        )}
        {mode === "typing" && (
          <button
            type="button"
            className={styles.actionButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveCurrent}
          >
            저장하기 <kbd>1</kbd>
          </button>
        )}
        {mode !== "typing" && (
          <button
            type="button"
            className={styles.actionButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => dispatch({ type: "HINT" })}
          >
            힌트 보기 <kbd>{mode === "listening" ? "2" : "1"}</kbd>
          </button>
        )}
        {mode !== "typing" && (
          <button
            type="button"
            className={styles.actionButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={revealAnswer}
          >
            정답 보기 <kbd>{mode === "listening" ? "3" : "2"}</kbd>
          </button>
        )}
      </div>

      <footer className={styles.bottomBar}>
        <StreakPill streak={state.streak} />
        <span className={styles.navHints}>
          <kbd>←</kbd> 이전 단어 &nbsp;·&nbsp; 다음 단어 <kbd>→</kbd>
          {mode === "listening" && (
            <>
              &nbsp;·&nbsp; <kbd>tab</kbd> 다시 듣기
            </>
          )}
        </span>
      </footer>
    </div>
  );
}

/* Carousel card ------------------------------------------------------------ */

const WordCard = memo(function WordCard({
  word,
  offset,
  mode,
  difficulty,
  wrongReview,
  saved,
  stage,
  justCompleted,
  showMeaning = false,
}: {
  word: WordState;
  offset: number;
  mode: SessionMode;
  difficulty: Difficulty;
  /** 복습 풀 출신 중 실제로 틀린 적 있는 단어. */
  wrongReview: boolean;
  saved: boolean;
  /** 익힘 단계 라벨 — 복습 풀에 기록이 있는 단어에만 값이 있다. */
  stage: { label: string; tone: EaseStageTone } | null;
  /** 이 단어가 세션에서 가장 최근에 완료된 단어다 — 다음 카드로 넘어가기
   *  전 홀드 구간에서만 참이라, 정오답 도장을 잠깐 찍었다 지우는 데 쓴다. */
  justCompleted: boolean;
  /** 리스닝 '뜻 보기' — 완료 전에도 뜻을 노출한다. */
  showMeaning?: boolean;
}) {
  const active = offset === 0;
  const depth = Math.abs(offset);
  const sign = Math.sign(offset);
  // Neighbors sit right at the screen edge so the track's overflow:hidden
  // clips them to a ~50% sliver; anything past that is pushed fully offstage.
  const xVw = depth === 0 ? 0 : depth === 1 ? sign * 52 : sign * 90;
  const correct =
    word.status === "done" &&
    !word.gaveUp &&
    word.typed.toLowerCase() === word.entry.word.toLowerCase();
  // normal·hard 는 완료 전까지 정오답을 가리는데, 오타마다 흔들리면 그
  // 자체가 "지금 틀렸다"는 즉시 피드백이 되어버린다 — 단어가 끝날 때까지는
  // 흔들리지 않는다. easy·typing 모드는 원래대로 즉시 흔들린다.
  const suppressShake =
    mode !== "typing" && difficulty !== "easy" && word.status !== "done";
  const shaking = word.lastMistakeAt !== null && !suppressShake;

  // 예문이 여러 개면 카드마다 하나를 랜덤으로 골라 보여준다 — 타이핑 중
  // 리렌더에도 바뀌지 않게 단어 id 가 같은 동안은 한 번만 뽑는다.
  const exampleCount = word.entry.example?.length ?? 0;
  const exampleIdx = useMemo(
    () => (exampleCount > 0 ? Math.floor(Math.random() * exampleCount) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word.entry.id],
  );
  const example = word.entry.example?.[exampleIdx];
  const exampleKo = word.entry.exampleMeaning?.[exampleIdx];

  return (
    <motion.div
      className={active ? `${styles.card} ${styles.cardActive}` : styles.card}
      style={{ zIndex: 10 - depth }}
      initial={{
        x: `${xVw}vw`,
        scale: 0.4,
        opacity: 0,
        rotateY: offset * -14,
        filter: "blur(0px)",
      }}
      animate={{
        x: `${xVw}vw`,
        scale: depth === 0 ? 1 : depth === 1 ? 0.92 : 0.8,
        opacity: depth === 0 ? 1 : depth === 1 ? 0.55 : 0.2,
        rotateY: offset * -14,
        filter: depth === 0 ? "blur(0px)" : "blur(1.5px)",
      }}
      exit={{ opacity: 0, scale: 0.35 }}
      transition={cardSpring}
    >
      <AnimatePresence>
        {active && justCompleted && (
          <motion.span
            key="gradeMark"
            className={styles.gradeMark}
            initial={{ opacity: 0, scale: 0.4, rotate: -26 }}
            animate={{ opacity: 1, scale: 1, rotate: -10 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            aria-hidden="true"
          >
            {correct ? <CheckStampIcon /> : <CrossStampIcon />}
          </motion.span>
        )}
      </AnimatePresence>
      {stage && (
        <span className={`${styles.stage} ${STAGE_CLASS[stage.tone]}`}>
          {stage.label}
        </span>
      )}
      {(wrongReview || saved || word.hinted) && (
        <span className={styles.cardBadgeRow}>
          {wrongReview && (
            <span className={styles.reviewBadge}>틀렸던 단어</span>
          )}
          {saved && <span className={styles.savedBadge}>저장한 단어</span>}
          {word.hinted && <span className={styles.hintSeenBadge}>힌트 봄</span>}
        </span>
      )}
      <span
        key={word.lastMistakeAt ?? -1}
        className={
          shaking ? `${styles.shakeLayer} ${styles.shaking}` : styles.shakeLayer
        }
      >
        {mode === "listening" ? (
          // 리스닝: 완료 전엔 뜻을 숨기고, 퀴즈처럼 예문 문장 속 빈 슬롯에
          // 받아쓴다 — 문맥이 힌트가 되고 단어 자체는 슬롯이라 안 새어나간다.
          // 완료 후 홀드 동안 뜻을 보여줘 철자+뜻으로 마무리하게 한다.
          <>
            {word.status === "done" || showMeaning ? (
              <Meaning entry={word.entry} />
            ) : (
              <ListeningPrompt word={word.entry.word} active={active} />
            )}
            {active && difficulty === "easy" ? (
              <ExampleLine
                word={word}
                mode={mode}
                active={active}
                difficulty={difficulty}
                example={example}
                exampleKo={exampleKo}
                showMeaning={showMeaning}
              />
            ) : (
              <WordGlyphs
                word={word}
                mode={mode}
                active={active}
                difficulty={difficulty}
              />
            )}
          </>
        ) : (
          <>
            <Meaning entry={word.entry} />
            {/* Typing 은 난이도 스캐폴딩(Quiz/Listening 전용) 대상이 아니라
                항상 예문을 보여준다 — 난이도가 갈리는 건 Quiz뿐. */}
            {active && (mode === "typing" || difficulty === "easy") ? (
              <ExampleLine
                word={word}
                mode={mode}
                active={active}
                difficulty={difficulty}
                example={example}
                exampleKo={exampleKo}
              />
            ) : (
              <WordGlyphs
                word={word}
                mode={mode}
                active={active}
                difficulty={difficulty}
              />
            )}
          </>
        )}
      </span>
    </motion.div>
  );
});

/* Listening prompt ----------------------------------------------------------
   완료 전 리스닝 카드의 머리 부분 — 뜻 대신 안내 문구와 다시 듣기 버튼. */

function ListeningPrompt({ word, active }: { word: string; active: boolean }) {
  return (
    <span className={styles.listeningPrompt}>
      <span className={styles.listeningHint}>
        <SpeakerIcon muted={false} />
        발음을 듣고 철자를 입력하세요
      </span>
      {active && (
        <button
          type="button"
          className={styles.replayButton}
          // 숨은 모바일 입력의 포커스를 뺏어 키보드가 닫히지 않게
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => speak(word)}
        >
          다시 듣기 <kbd>tab</kbd>
        </button>
      )}
    </span>
  );
}

function Meaning({ entry }: { entry: WordEntry }) {
  // 한 뜻이 여러 품사를 겸할 수 있어(prep+adv 등) 평탄화 후 중복 제거
  const posSet = [...new Set(entry.senses.flatMap((s) => s.pos ?? []))];
  return (
    <span className={styles.meaningBlock}>
      <span className={styles.meaning}>
        {entry.senses.map((s) => s.meaning).join(" · ")}
      </span>
      {posSet.length > 0 && (
        <span className={styles.posRow}>
          {posSet.map((pos) => (
            <span key={pos} className={styles.pos}>
              {POS_LABEL[pos]}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/* Example sentence ------------------------------------------------------------
   Show the word's glyphs (typing/quiz) inline at its natural spot in a short
   example sentence, so the target word stays the same size/behavior it
   always had — just framed by the rest of the sentence around it. */

function findWordSpan(
  word: string,
  example: string | undefined,
): { prefix: string; suffix: string } | null {
  if (!example) return null;
  const boundary = new RegExp(`\\b${word}\\b`, "i").exec(example);
  if (boundary) {
    return {
      prefix: example.slice(0, boundary.index),
      suffix: example.slice(boundary.index + boundary[0].length),
    };
  }
  const idx = example.toLowerCase().indexOf(word.toLowerCase());
  if (idx === -1) return null;
  return {
    prefix: example.slice(0, idx),
    suffix: example.slice(idx + word.length),
  };
}

function ExampleLine({
  word,
  mode,
  active,
  difficulty,
  example,
  exampleKo,
  showMeaning = false,
}: {
  word: WordState;
  mode: SessionMode;
  active: boolean;
  difficulty: Difficulty;
  /** 카드가 고른 예문 하나 (여러 개면 랜덤 선택된 것). */
  example?: string;
  /** 위 예문과 짝을 이루는 한글 해석. */
  exampleKo?: string;
  /** 리스닝 '뜻 보기' — 눌렀을 때만 예문 해석도 함께 보여준다. */
  showMeaning?: boolean;
}) {
  const span = findWordSpan(word.entry.word, example);
  if (!span)
    return (
      <WordGlyphs word={word} mode={mode} active={active} difficulty={difficulty} />
    );

  return (
    <span className={styles.sentenceBlock}>
      <span className={styles.sentenceRow}>
        {span.prefix && (
          <span className={styles.sentenceText}>{span.prefix}</span>
        )}
        <WordGlyphs word={word} mode={mode} active={active} difficulty={difficulty} />
        {span.suffix && (
          <span className={styles.sentenceText}>{span.suffix}</span>
        )}
      </span>
      {/* 리스닝은 해석이 답의 뜻을 미리 알려줘 받아쓰기 긴장이 풀린다 —
          숨기되, 뜻 보기를 눌렀을 땐 이미 뜻이 열렸으니 함께 보여준다 */}
      {(mode !== "listening" || showMeaning) && exampleKo && (
        <span className={styles.sentenceMeaning}>{exampleKo}</span>
      )}
    </span>
  );
}

/* Character rendering -------------------------------------------------------
   Typing: full word visible; typed chars light up.
   Quiz: empty slots; chars appear as typed. Ghosts show the always-visible
   first letter and the full answer after Space (정답 보기). */

function WordGlyphs({
  word,
  mode,
  active,
  difficulty,
}: {
  word: WordState;
  mode: SessionMode;
  active: boolean;
  difficulty: Difficulty;
}) {
  const target = word.entry.word;
  const typedLen = word.typed.length;
  // 자동으로 노출되는 첫 글자 고스트 — easy 는 Quiz·Listening 둘 다,
  // normal 은 지금처럼 Quiz만, hard 는 자동 고스트 없음. 유저가 힌트
  // 버튼으로 연 hintedUpTo 는 난이도와 무관하게 항상 반영된다.
  const baselineGhost =
    difficulty === "hard" ? 0 : difficulty === "easy" ? 1 : mode === "quiz" ? 1 : 0;
  const hintBoundary = Math.max(baselineGhost, word.hintedUpTo);

  // hard: 정답 길이를 미리 드러내지 않는다 — 타이핑한 만큼(+커서 하나)과
  // 힌트로 열린 만큼만 슬롯을 그린다. 완료 시점엔 quiz/listening 모두
  // 키 입력이 그대로 typed 에 쌓이는 구조라 typedLen 이 이미 target.length
  // 와 같아져 전체가 자연히 드러난다.
  const revealLen =
    mode !== "typing" && difficulty === "hard"
      ? Math.min(
          target.length,
          Math.max(hintBoundary, typedLen + (word.status === "done" ? 0 : 1)),
        )
      : target.length;

  // 끝까지 쳤는데 틀린 채 완료 — 유저 입력 위에 정답을 띄워준다.
  // (정답 보기는 고스트가 이미 정답을 보여주므로 제외)
  const showAnswerAbove =
    mode !== "typing" &&
    word.status === "done" &&
    !word.gaveUp &&
    word.typed.toLowerCase() !== target.toLowerCase();

  // easy 는 타이핑하는 즉시 정오답이 드러나지만, normal·hard 는 한 글자씩
  // 파랗게 보이면 "이미 맞았다"는 착각을 준다 — 단어를 다 입력해 완료된
  // 순간(status==='done')에야 정오답을 색으로 갈라 보여준다. 그 전까진
  // 입력된 글자 모두 회색 "입력됨" 톤.
  const revealGrading = difficulty === "easy" || word.status === "done";

  return (
    <span className={styles.wordRow}>
      {showAnswerAbove && (
        <span className={styles.answerAbove}>{target}</span>
      )}
      {Array.from({ length: revealLen }, (_, i) => target[i]).map((ch, i) => {
        const done = i < typedLen;
        const isCursor = active && i === typedLen && word.status !== "done";

        // 퀴즈·리스닝: 빈 슬롯에 입력이 그대로 박힌다. 퀴즈만 첫 글자
        // 고스트를 보여주고, 리스닝은 hintedUpTo(정답 보기)만 따른다.
        if (mode !== "typing") {
          const typedChar = word.typed[i];
          const wrong = done && typedChar !== ch && revealGrading;
          const ghost = !done && i < hintBoundary;
          return (
            <span
              key={i}
              className={[
                styles.slot,
                done ? (revealGrading ? styles.slotDone : styles.slotTyped) : "",
                wrong ? styles.slotWrong : "",
                isCursor ? styles.slotCursor : "",
              ].join(" ")}
            >
              {done ? (
                <span
                  className={`${styles.glyphPop} ${
                    !revealGrading
                      ? styles.glyphTyped
                      : wrong
                        ? styles.glyphWrong
                        : ""
                  }`}
                >
                  {typedChar}
                </span>
              ) : ghost ? (
                <span className={styles.glyphGhost}>{ch}</span>
              ) : (
                // NBSP: 일반 공백은 flex 컨테이너(슬롯)가 버려서 높이가 0이
                // 된다 — 고스트 없는 리스닝 모드에서 슬롯이 무너지지 않게.
                " "
              )}
            </span>
          );
        }

        return (
          <span
            key={i}
            className={
              done
                ? `${styles.char} ${styles.charDone}`
                : isCursor
                  ? `${styles.char} ${styles.charCursor}`
                  : `${styles.char} ${styles.charPending}`
            }
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/* Grading stamps — 완료 직후 홀드 구간에 잠깐 찍히는 정오답 도장.
   글자 색만으로는 "지금 막 완료됐다"와 "타이핑 중"이 구분되지 않아서
   생긴 요청 — 채점 도장처럼 눈에 띄는 신호를 더한다. -------------------- */

function CheckStampIcon() {
  return (
    <svg viewBox="0 0 40 40" width="56" height="56" fill="none">
      <path
        d="M9 21l7 7 15-17"
        stroke="var(--accent-deep)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossStampIcon() {
  return (
    <svg viewBox="0 0 40 40" width="56" height="56" fill="none">
      <path
        d="M10 10l20 20M30 10L10 30"
        stroke="var(--danger)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Streak --------------------------------------------------------------------- */

function StreakPill({ streak }: { streak: number }) {
  return (
    <span className={styles.streakArea}>
      <AnimatePresence>
        {streak >= 5 && (
          <motion.span
            className={styles.streakPill}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            연속{" "}
            <motion.span
              key={streak}
              className={styles.streakNum}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
            >
              {streak}
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 22 22" width="19" height="19" fill="none">
      <path
        d="M4 8.5v5h3l4 3.5v-12l-4 3.5H4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M14.5 8.5l4.5 5m0-5l-4.5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M14.5 8.2a4.4 4.4 0 0 1 0 5.6M16.8 6a7.6 7.6 0 0 1 0 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
