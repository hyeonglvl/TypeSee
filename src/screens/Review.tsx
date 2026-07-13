import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { STARTER_WORDS } from "@/data/words";
import {
  clearAll,
  clearSaved,
  clearSavedWord,
  clearWrong,
  clearWrongWord,
  useReviewPool,
} from "@/lib/reviewStore";
import { useAuthUser } from "@/lib/auth";
import HistorySheet from "@/screens/HistorySheet";
import type { SessionMode, WordEntry } from "@/lib/types";
import styles from "./Review.module.css";

interface Props {
  onStart: (mode: SessionMode, words: WordEntry[]) => void;
  onBack: () => void;
}

export default function ReviewScreen({ onStart, onBack }: Props) {
  const pool = useReviewPool();
  const user = useAuthUser();
  const [historyOpen, setHistoryOpen] = useState(false);

  const entries = useMemo(
    () =>
      STARTER_WORDS.filter((w) => pool.ids.has(w.id)).sort(
        (a, b) => pool.wrongCountOf(b.id) - pool.wrongCountOf(a.id),
      ),
    [pool],
  );

  // A word saved via Space is shown under "저장한 단어" even if it also
  // has mistakes — the badge already prioritizes "저장" over the miss count.
  const wrongEntries = useMemo(
    () => entries.filter((w) => !pool.isSaved(w.id)),
    [entries, pool],
  );
  const savedEntries = useMemo(
    () => entries.filter((w) => pool.isSaved(w.id)),
    [entries, pool],
  );

  useEffect(() => {
    if (historyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
      else if (e.key === "1" && entries.length > 0) onStart("quiz", entries);
      else if (e.key === "2" && entries.length > 0) onStart("typing", entries);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, onStart, onBack, historyOpen]);

  // Everything mastered while sitting here → nothing left to review
  useEffect(() => {
    if (entries.length === 0) onBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const totalWrong = entries.reduce((n, w) => n + pool.wrongCountOf(w.id), 0);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>복습 노트</p>
        <h1 className={styles.title}>
          복습 및 저장 단어 총{" "}
          <span className={styles.titleCount}>{entries.length}</span>개
        </h1>
        <p className={styles.subtitle}>
          틀려서 쌓인 단어와 스페이스로 저장해둔 단어를 모아봤어요 · 틀린 단어{" "}
          {wrongEntries.length} · 저장한 단어 {savedEntries.length} · 누적 오타{" "}
          {totalWrong}회
          {pool.retainedIds.size > 0 && <> · 마스터 {pool.retainedIds.size}개</>}
          {" · "}
          {user
            ? "계정에 저장되었어요"
            : "로그인하면 이 목록이 계정에 저장돼요"}
        </p>
      </header>

      <div className={styles.lists}>
        {wrongEntries.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span>
                틀린 단어{" "}
                <span className={styles.sectionCount}>
                  {wrongEntries.length}
                </span>
              </span>
              <button
                type="button"
                className={styles.sectionClear}
                onClick={() => {
                  if (window.confirm("틀린 단어 기록을 모두 지울까요?"))
                    clearWrong();
                }}
              >
                모두 지우기
              </button>
            </h2>
            <ul className={styles.list}>
              <AnimatePresence initial={false}>
                {wrongEntries.map((entry, i) => (
                  <motion.li
                    key={entry.id}
                    className={styles.row}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  >
                    <span className={styles.word}>{entry.word}</span>
                    <span className={styles.meaning}>
                      {entry.senses.map((s) => s.meaning).join(" · ")}
                    </span>
                    <span className={styles.missBadge}>
                      ×{pool.wrongCountOf(entry.id)}
                    </span>
                    <button
                      type="button"
                      className={styles.rowDelete}
                      aria-label={`${entry.word} 틀린 단어 기록 삭제`}
                      onClick={() => clearWrongWord(entry.id)}
                    >
                      ✕
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}

        {savedEntries.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span>
                저장한 단어{" "}
                <span className={styles.sectionCount}>
                  {savedEntries.length}
                </span>
              </span>
              <button
                type="button"
                className={styles.sectionClear}
                onClick={() => {
                  if (window.confirm("저장한 단어를 모두 지울까요?"))
                    clearSaved();
                }}
              >
                모두 지우기
              </button>
            </h2>
            <ul className={styles.list}>
              <AnimatePresence initial={false}>
                {savedEntries.map((entry, i) => (
                  <motion.li
                    key={entry.id}
                    className={styles.row}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  >
                    <span className={styles.word}>{entry.word}</span>
                    <span className={styles.meaning}>
                      {entry.senses.map((s) => s.meaning).join(" · ")}
                    </span>
                    <span className={styles.savedBadge}>저장</span>
                    <button
                      type="button"
                      className={styles.rowDelete}
                      aria-label={`${entry.word} 저장한 단어 기록 삭제`}
                      onClick={() => clearSavedWord(entry.id)}
                    >
                      ✕
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          onClick={() => onStart("quiz", entries)}
        >
          Quiz로 복습 <kbd className={styles.kbdOnAccent}>1</kbd>
        </button>
        <button
          className={styles.ghostButton}
          onClick={() => onStart("typing", entries)}
        >
          Typing으로 복습 <kbd>2</kbd>
        </button>
        <button className={styles.ghostButton} onClick={onBack}>
          뒤로 <kbd>esc</kbd>
        </button>
      </div>

      <div className={styles.footerLinks}>
        <button
          className={styles.clearButton}
          onClick={() => setHistoryOpen(true)}
        >
          역대 오답 목록
        </button>
        <span className={styles.footerDivider}>·</span>
        <button
          className={styles.clearButton}
          onClick={() => {
            if (window.confirm("틀렸던 단어와 저장한 단어를 모두 지울까요?"))
              clearAll();
          }}
        >
          기록 모두 지우기
        </button>
      </div>

      <AnimatePresence>
        {historyOpen && <HistorySheet onClose={() => setHistoryOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
