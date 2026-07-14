import { memo, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createSession, sessionReducer, summarize } from "@/lib/engine";
import { ensureSoundOn, speak, toggleSound, useSoundPref } from "@/lib/tts";
import { easeProgress, saveWord, useReviewPool } from "@/lib/reviewStore";
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
  phrase: "구",
};

const WINDOW = 2;
const FINISH_HOLD_MS = 700;
const ADVANCE_HOLD_MS = 500;
const GIVE_UP_HOLD_MS = 1500;
// 리스닝은 맞힌 뒤에야 뜻이 보인다 — 읽을 시간을 주되 정답 봄(1.5초)보다는
// 0.5초 빠르게 넘긴다.
const LISTENING_ADVANCE_HOLD_MS = 1000;

const cardSpring = { type: "spring", stiffness: 280, damping: 30 } as const;

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

  const handleSpace = () => {
    const id = stateRef.current.words[stateRef.current.currentIndex].entry.id;
    if (mode !== "typing") {
      dispatch({ type: "REVEAL" });
      saveWord(id);
    } else {
      saveWord(id);
      setSavedIds((prev) => new Set(prev).add(id));
    }
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
        handleSpace();
      } else if (e.key === "Tab" && mode === "listening") {
        e.preventDefault();
        if (e.repeat) return;
        replayCurrent();
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

  // 리스닝 '뜻 보기' — 카드가 넘어가면 다시 닫힌다
  const [meaningShown, setMeaningShown] = useState(false);
  useEffect(() => {
    setMeaningShown(false);
  }, [state.currentIndex]);

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
      if (char === " ") handleSpace();
      // 한글 등 비 ASCII 문자는 IME 조합 산출물 — 오답으로 세지 않고 무시
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
  }, [state.lastCompletedId]);

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
            // 복습 풀에는 틀린 단어와 저장한 단어가 섞여 있다. 복습 노트
            // 화면과 같은 기준으로 저장 여부가 우선한다 — 저장한 단어는
            // 틀린 적이 있어도 "저장한 단어"로 보여준다.
            const isSaved =
              savedIds.has(word.entry.id) ||
              (word.fromReview && pool.isSaved(word.entry.id));
            const wrongReview =
              word.fromReview &&
              !isSaved &&
              pool.wrongCountOf(word.entry.id) > 0;
            return (
              <WordCard
                key={word.entry.id}
                word={word}
                offset={first + i - state.currentIndex}
                mode={mode}
                wrongReview={wrongReview}
                saved={isSaved}
                ease={word.fromReview ? pool.easeOf(word.entry.id) : null}
                showMeaning={
                  meaningShown && first + i === state.currentIndex
                }
              />
            );
          })}
        </AnimatePresence>
      </div>

      {mode !== "typing" && (
        <div className={styles.actionBar}>
          {mode === "listening" && (
            <button
              type="button"
              className={styles.actionButton}
              // 숨은 모바일 입력의 포커스를 뺏어 키보드가 닫히지 않게
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!meaningShown) dispatch({ type: "SHOW_MEANING" });
                setMeaningShown((v) => !v);
              }}
            >
              {meaningShown ? "뜻 감추기" : "뜻 보기"}
            </button>
          )}
          <button
            type="button"
            className={styles.actionButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => dispatch({ type: "HINT" })}
          >
            힌트 보기
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSpace}
          >
            정답 보기
          </button>
        </div>
      )}

      <footer className={styles.bottomBar}>
        <StreakPill streak={state.streak} />
        <span className={styles.navHints}>
          <kbd>←</kbd> 이전 단어 &nbsp;·&nbsp; <kbd>→</kbd> 건너뛰기
          &nbsp;·&nbsp; <kbd>space</kbd>{" "}
          {mode === "typing" ? "저장" : "정답 보기"}
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
  wrongReview,
  saved,
  ease,
  showMeaning = false,
}: {
  word: WordState;
  offset: number;
  mode: SessionMode;
  /** 복습 풀 출신 중 실제로 틀린 적 있는 단어. */
  wrongReview: boolean;
  saved: boolean;
  /** TS-1 ease factor — 익힘 단계 점 표시용, 복습 풀 출신 단어에만 값이 있다. */
  ease: number | null;
  /** 리스닝 '뜻 보기' — 완료 전에도 뜻을 노출한다. */
  showMeaning?: boolean;
}) {
  const active = offset === 0;
  const depth = Math.abs(offset);
  const sign = Math.sign(offset);
  // Neighbors sit right at the screen edge so the track's overflow:hidden
  // clips them to a ~50% sliver; anything past that is pushed fully offstage.
  const xVw = depth === 0 ? 0 : depth === 1 ? sign * 52 : sign * 90;

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
      {wrongReview && (
        <span className={styles.reviewBadge}>
          틀렸던 단어{ease !== null && <EaseDots ease={ease} />}
        </span>
      )}
      {saved && (
        <span className={styles.savedBadge}>
          저장한 단어{ease !== null && <EaseDots ease={ease} />}
        </span>
      )}
      <span
        key={word.lastMistakeAt ?? -1}
        className={
          word.lastMistakeAt !== null
            ? `${styles.shakeLayer} ${styles.shaking}`
            : styles.shakeLayer
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
            {active ? (
              <ExampleLine
                word={word}
                mode={mode}
                active={active}
                showMeaning={showMeaning}
              />
            ) : (
              <WordGlyphs word={word} mode={mode} active={active} />
            )}
          </>
        ) : (
          <>
            <Meaning entry={word.entry} />
            {active ? (
              <ExampleLine word={word} mode={mode} active={active} />
            ) : (
              <WordGlyphs word={word} mode={mode} active={active} />
            )}
          </>
        )}
      </span>
    </motion.div>
  );
});

/* Ease progress ---------------------------------------------------------------
   TS-1 ease(1.3~3.0)를 5단계 점으로 — 배지의 잉크색을 그대로 물려받는다. */

function EaseDots({ ease }: { ease: number }) {
  const step = easeProgress(ease);
  return (
    <span
      className={styles.easeDots}
      role="img"
      aria-label={`익힘 단계 ${step} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={
            n <= step ? `${styles.easeDot} ${styles.easeDotOn}` : styles.easeDot
          }
        />
      ))}
    </span>
  );
}

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
  const posSet = [...new Set(entry.senses.map((s) => s.pos).filter(Boolean))];
  return (
    <span className={styles.meaningBlock}>
      <span className={styles.meaning}>
        {entry.senses.map((s) => s.meaning).join(" · ")}
      </span>
      {posSet.length > 0 && (
        <span className={styles.posRow}>
          {posSet.map((pos) => (
            <span key={pos} className={styles.pos}>
              {POS_LABEL[pos as Pos]}
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
  entry: WordEntry,
): { prefix: string; suffix: string } | null {
  const { word, example } = entry;
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
  showMeaning = false,
}: {
  word: WordState;
  mode: SessionMode;
  active: boolean;
  /** 리스닝 '뜻 보기' — 눌렀을 때만 예문 해석도 함께 보여준다. */
  showMeaning?: boolean;
}) {
  const span = findWordSpan(word.entry);
  if (!span) return <WordGlyphs word={word} mode={mode} active={active} />;

  return (
    <span className={styles.sentenceBlock}>
      <span className={styles.sentenceRow}>
        {span.prefix && (
          <span className={styles.sentenceText}>{span.prefix}</span>
        )}
        <WordGlyphs word={word} mode={mode} active={active} />
        {span.suffix && (
          <span className={styles.sentenceText}>{span.suffix}</span>
        )}
      </span>
      {/* 리스닝은 해석이 답의 뜻을 미리 알려줘 받아쓰기 긴장이 풀린다 —
          숨기되, 뜻 보기를 눌렀을 땐 이미 뜻이 열렸으니 함께 보여준다 */}
      {(mode !== "listening" || showMeaning) && word.entry.exampleMeaning && (
        <span className={styles.sentenceMeaning}>
          {word.entry.exampleMeaning}
        </span>
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
}: {
  word: WordState;
  mode: SessionMode;
  active: boolean;
}) {
  const target = word.entry.word;
  const typedLen = word.typed.length;
  const hintBoundary = Math.max(mode === "quiz" ? 1 : 0, word.hintedUpTo);

  return (
    <span className={styles.wordRow}>
      {target.split("").map((ch, i) => {
        const done = i < typedLen;
        const isCursor = active && i === typedLen && word.status !== "done";

        // 퀴즈·리스닝: 빈 슬롯에 입력이 그대로 박힌다. 퀴즈만 첫 글자
        // 고스트를 보여주고, 리스닝은 hintedUpTo(정답 보기)만 따른다.
        if (mode !== "typing") {
          const typedChar = word.typed[i];
          const wrong = done && typedChar !== ch;
          const ghost = !done && i < hintBoundary;
          return (
            <span
              key={i}
              className={[
                styles.slot,
                done ? styles.slotDone : "",
                wrong ? styles.slotWrong : "",
                isCursor ? styles.slotCursor : "",
              ].join(" ")}
            >
              {done ? (
                <span className={wrong ? styles.glyphWrong : styles.glyphPop}>
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
    <svg viewBox="0 0 22 22" width="17" height="17" fill="none">
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
