import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { STARTER_WORDS } from "@/data/words";
import { clearAll, useReviewPool } from "@/lib/reviewStore";
import { useAuthUser } from "@/lib/auth";
import type { SessionMode, WordEntry } from "@/lib/types";
import styles from "./Review.module.css";

interface Props {
  onStart: (mode: SessionMode, words: WordEntry[]) => void;
  onBack: () => void;
}

export default function ReviewScreen({ onStart, onBack }: Props) {
  const pool = useReviewPool();
  const user = useAuthUser();

  const entries = useMemo(
    () =>
      STARTER_WORDS.filter((w) => pool.ids.has(w.id)).sort(
        (a, b) => pool.wrongCountOf(b.id) - pool.wrongCountOf(a.id),
      ),
    [pool],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
      else if (e.key === "1" && entries.length > 0) onStart("typing", entries);
      else if (e.key === "2" && entries.length > 0) onStart("quiz", entries);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, onStart, onBack]);

  // Everything mastered while sitting here → nothing left to review
  useEffect(() => {
    if (entries.length === 0) onBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const totalWrong = entries.reduce(
    (n, w) => n + pool.wrongCountOf(w.id),
    0,
  );

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>복습 노트</p>
        <h1 className={styles.title}>
          틀렸던 단어 <span className={styles.titleCount}>{entries.length}</span>
        </h1>
        <p className={styles.subtitle}>
          누적 오타 {totalWrong}회 ·{" "}
          {user
            ? "계정에 저장되어 어디서든 이어집니다"
            : "로그인하면 이 목록이 계정에 저장돼요"}
        </p>
      </header>

      <ul className={styles.list}>
        {entries.map((entry, i) => (
          <motion.li
            key={entry.id}
            className={styles.row}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.4) }}
          >
            <span className={styles.word}>{entry.word}</span>
            <span className={styles.meaning}>
              {entry.senses.map((s) => s.meaning).join(" · ")}
            </span>
            <span className={styles.missBadge}>
              ×{pool.wrongCountOf(entry.id)}
            </span>
          </motion.li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          onClick={() => onStart("quiz", entries)}
        >
          Quiz로 복습 <kbd className={styles.kbdOnAccent}>2</kbd>
        </button>
        <button
          className={styles.ghostButton}
          onClick={() => onStart("typing", entries)}
        >
          Typing으로 복습 <kbd>1</kbd>
        </button>
        <button className={styles.ghostButton} onClick={onBack}>
          뒤로 <kbd>esc</kbd>
        </button>
      </div>

      <button
        className={styles.clearButton}
        onClick={() => {
          if (window.confirm("틀렸던 단어 기록을 모두 지울까요?")) clearAll();
        }}
      >
        기록 모두 지우기
      </button>
    </div>
  );
}
