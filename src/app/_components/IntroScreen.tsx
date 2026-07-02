"use client";

import { STARTER_WORDS } from "@/data/words";
import { shuffle } from "@/lib/session";
import type { SessionMode, WordEntry } from "@/lib/types";
import styles from "./IntroScreen.module.css";

interface Props {
  onStart: (words: WordEntry[], mode: SessionMode) => void;
}

const SESSION_SIZES = [10, 20, STARTER_WORDS.length] as const;

const CATEGORIES: { mode: SessionMode; label: string }[] = [
  { mode: "typing", label: "Typing" },
  { mode: "quiz", label: "Quiz" },
];

export default function IntroScreen({ onStart }: Props) {
  const handlePick = (count: number, mode: SessionMode) => {
    const words = shuffle(STARTER_WORDS).slice(0, count);
    onStart(words, mode);
  };

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>TypeSee</h1>
      <p className={styles.subtitle}>타이핑하며 눈에 새기는 영단어</p>
      {CATEGORIES.map(({ mode, label }) => (
        <div key={mode} className={styles.category}>
          <h2 className={styles.categoryTitle}>{label}</h2>
          <div className={styles.options}>
            {SESSION_SIZES.map((count, i) => (
              <button
                key={count}
                className={styles.optionButton}
                onClick={() => handlePick(count, mode)}
              >
                {i === SESSION_SIZES.length - 1 ? `전체 ${count}개` : `${count}개`}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
