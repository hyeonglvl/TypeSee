import { memo, useEffect, useReducer, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createSession, sessionReducer, summarize } from "@/lib/engine";
import { speak, toggleSound, useSoundPref } from "@/lib/tts";
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

const cardSpring = { type: "spring", stiffness: 280, damping: 30 } as const;

export default function SessionScreen({
  words,
  mode,
  reviewIds,
  onFinish,
  onExit,
}: Props) {
  const [state, dispatch] = useReducer(sessionReducer, null, () =>
    createSession(words, reviewIds),
  );
  const soundOn = useSoundPref();

  const stateRef = useRef(state);
  stateRef.current = state;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onExitRef.current(summarize(stateRef.current, mode));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "BACKSPACE" });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        dispatch({ type: "PREV_WORD" });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        dispatch({ type: "NEXT_WORD" });
      } else if (e.key.length === 1) {
        e.preventDefault();
        dispatch({ type: "TYPE_CHAR", char: e.key });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pronounce a word the moment it's completed
  useEffect(() => {
    if (state.lastCompletedId === null) return;
    const completed = words.find((w) => w.id === state.lastCompletedId);
    if (completed) speak(completed.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastCompletedId]);

  const finished = state.finishedAt !== null;
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => onFinish(summarize(state, mode)), FINISH_HOLD_MS);
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
    <div className={styles.screen}>
      <motion.div
        className={styles.progressFill}
        animate={{ width: `${(doneCount / total) * 100}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 36 }}
      />

      <header className={styles.topBar}>
        <span className={styles.topHint}>
          <kbd>esc</kbd> 나가기
        </span>

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

      <div className={styles.track}>
        <AnimatePresence initial={false}>
          {visible.map((word, i) => (
            <WordCard
              key={word.entry.id}
              word={word}
              offset={first + i - state.currentIndex}
              mode={mode}
            />
          ))}
        </AnimatePresence>
      </div>

      <footer className={styles.bottomBar}>
        <StreakPill streak={state.streak} />
        <span className={styles.navHints}>
          <kbd>←</kbd> 이전 단어 &nbsp;·&nbsp; <kbd>→</kbd> 건너뛰기
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
}: {
  word: WordState;
  offset: number;
  mode: SessionMode;
}) {
  const active = offset === 0;
  const depth = Math.abs(offset);

  return (
    <motion.div
      className={active ? `${styles.card} ${styles.cardActive}` : styles.card}
      style={{ zIndex: 10 - depth }}
      initial={{
        x: `${offset * 26}vw`,
        scale: 0.4,
        opacity: 0,
        rotateY: offset * -14,
      }}
      animate={{
        x: `${offset * 26}vw`,
        scale: depth === 0 ? 1 : depth === 1 ? 0.55 : 0.4,
        opacity: depth === 0 ? 1 : depth === 1 ? 0.35 : 0.12,
        rotateY: offset * -14,
      }}
      exit={{ opacity: 0, scale: 0.35 }}
      transition={cardSpring}
    >
      {word.fromReview && (
        <span className={styles.reviewBadge}>틀렸던 단어</span>
      )}
      <span
        key={word.lastMistakeAt ?? -1}
        className={
          word.lastMistakeAt !== null
            ? `${styles.shakeLayer} ${styles.shaking}`
            : styles.shakeLayer
        }
      >
        <Meaning entry={word.entry} />
        <WordGlyphs word={word} mode={mode} active={active} />
      </span>
    </motion.div>
  );
});

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

/* Character rendering -------------------------------------------------------
   Typing: full word visible; typed chars light up.
   Quiz: empty slots; chars appear as typed, hints ghost in after mistakes. */

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

        if (mode === "quiz") {
          const ghost = !done && i < hintBoundary;
          return (
            <span
              key={i}
              className={[
                styles.slot,
                done ? styles.slotDone : "",
                isCursor ? styles.slotCursor : "",
              ].join(" ")}
            >
              {done ? (
                <span className={styles.glyphPop}>{ch}</span>
              ) : ghost ? (
                <span className={styles.glyphGhost}>{ch}</span>
              ) : (
                " "
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
