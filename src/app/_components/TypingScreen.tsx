"use client";

import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import {
  createInitialSessionState,
  getVisibleCards,
  sessionReducer,
  summarize,
} from "@/lib/session";
import type {
  CardGeometry,
  SessionMode,
  SessionSummary,
  SessionWordState,
  WordEntry,
  WordSense,
} from "@/lib/types";
import styles from "./TypingScreen.module.css";

interface Props {
  words: WordEntry[];
  mode: SessionMode;
  onFinish: (summary: SessionSummary) => void;
  onExit: () => void;
}

const ROLE_CLASS = {
  active: styles.roleActive,
  completed: styles.roleCompleted,
  upcoming: styles.roleUpcoming,
} as const;

const POS_LABEL: Record<NonNullable<WordSense["pos"]>, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  phrase: "phrase",
};

export default function TypingScreen({ words, mode, onFinish, onExit }: Props) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    words,
    createInitialSessionState,
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }
      if (state.finishedAt !== null) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "BACKSPACE" });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        dispatch({ type: "PREV_WORD" });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        dispatch({ type: "NEXT_WORD" });
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        dispatch({ type: "TYPE_CHAR", char: e.key });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.finishedAt, onExit]);

  useEffect(() => {
    if (state.finishedAt !== null) {
      onFinish(summarize(state));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.finishedAt]);

  const completedCount = state.words.filter((w) => w.status === "done").length;
  const cards = getVisibleCards(state);

  return (
    <div className={styles.screen}>
      <div className={styles.progress}>
        {completedCount} / {state.words.length}
      </div>
      <div className={styles.track}>
        {cards.map(({ word, geometry }) => (
          <WordCard
            key={word.entry.id}
            word={word}
            geometry={geometry}
            mode={mode}
          />
        ))}
      </div>
      <div className={styles.wordNav}>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Previous Word"
          disabled={state.currentIndex === 0}
          onClick={() => dispatch({ type: "PREV_WORD" })}
        >
          <span className={styles.navIcon}>&#8592;</span>
        </button>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Next Word"
          disabled={state.currentIndex === state.words.length - 1}
          onClick={() => dispatch({ type: "NEXT_WORD" })}
        >
          <span className={styles.navIcon}>&#8594;</span>
        </button>
      </div>
      <div className={styles.hint}>
        <div>ESC = Go to Menu</div>
        <div>&#8592; = Previous word, &#8594; = Skip a word</div>
      </div>
    </div>
  );
}

function WordCard({
  word,
  geometry,
  mode,
}: {
  word: SessionWordState;
  geometry: CardGeometry;
  mode: SessionMode;
}) {
  const [mistakeTick, setMistakeTick] = useState(0);
  const lastSeenMistake = useRef(word.lastMistakeAt);

  useEffect(() => {
    if (word.lastMistakeAt !== lastSeenMistake.current) {
      lastSeenMistake.current = word.lastMistakeAt;
      setMistakeTick((n) => n + 1);
    }
  }, [word.lastMistakeAt]);

  const shakeClass =
    mistakeTick === 0
      ? ""
      : mistakeTick % 2 === 0
        ? styles.shakeB
        : styles.shakeA;

  return (
    <div
      className={`${styles.card} ${ROLE_CLASS[geometry.role]} ${shakeClass}`}
      style={{
        translate: `calc(-50% + ${geometry.translateXPercent}vw) -50%`,
        scale: geometry.scale,
      }}
    >
      <MeaningDisplay senses={word.entry.senses} />
      <TypedText
        target={word.entry.word}
        typed={word.typed}
        size={geometry.role === "active" ? "large" : "small"}
        isActive={geometry.role === "active"}
        mode={mode}
        hintedUpTo={word.hintedUpTo}
      />
    </div>
  );
}

function MeaningDisplay({ senses }: { senses: WordSense[] }) {
  const uniquePos = new Set(senses.map((sense) => sense.pos));
  const samePos = uniquePos.size <= 1;

  if (samePos) {
    const pos = senses[0]?.pos;
    return (
      <div className={styles.meaningBlock}>
        <span className={styles.meaning}>
          {senses.map((sense) => sense.meaning).join(" / ")}
        </span>
        {pos && <span className={styles.pos}>{POS_LABEL[pos]}</span>}
      </div>
    );
  }

  return (
    <div className={styles.meaningBlock}>
      <div className={styles.sensesRow}>
        {senses.map((sense, i) => (
          <Fragment key={sense.meaning}>
            {i > 0 && <span className={styles.meaning}>/</span>}
            <span className={styles.senseCol}>
              <span className={styles.meaning}>{sense.meaning}</span>
              {sense.pos && (
                <span className={styles.pos}>{POS_LABEL[sense.pos]}</span>
              )}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function TypedText({
  target,
  typed,
  size,
  isActive,
  mode,
  hintedUpTo,
}: {
  target: string;
  typed: string;
  size: "large" | "small";
  isActive: boolean;
  mode: SessionMode;
  hintedUpTo: number;
}) {
  const hintBoundary = Math.max(1, hintedUpTo);
  const sizeClass = size === "large" ? styles.textLarge : styles.textSmall;

  if (mode !== "quiz") {
    return (
      <span className={sizeClass}>
        {target.split("").map((ch, i) => (
          <span
            key={i}
            className={
              i < typed.length
                ? styles.charDone
                : isActive && i === typed.length
                  ? styles.charCursor
                  : styles.charPending
            }
          >
            {ch}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className={`${sizeClass} ${styles.quizWord}`}>
      {target.split("").map((ch, i) => {
        const revealed = i < typed.length;
        const isHint = i < hintBoundary;
        const shown = revealed || isHint;
        const stateClass = revealed
          ? styles.charDone
          : isActive && i === typed.length
            ? styles.charCursorQuiz
            : styles.charPending;
        return (
          <span key={i} className={`${styles.charSlot} ${stateClass}`}>
            {shown && <span className={styles.charGlyph}>{ch}</span>}
            <span className={styles.charBlank}>_</span>
          </span>
        );
      })}
    </span>
  );
}
