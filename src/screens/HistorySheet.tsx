import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { STARTER_WORDS } from "@/data/words";
import { clearHistoryAll, clearHistoryWord, useHistoryPool } from "@/lib/reviewStore";
import styles from "./HistorySheet.module.css";

interface Props {
  onClose: () => void;
}

export default function HistorySheet({ onClose }: Props) {
  const history = useHistoryPool();

  const entries = useMemo(
    () =>
      STARTER_WORDS.filter((w) => history.ids.has(w.id)).sort(
        (a, b) => history.wrongCountOf(b.id) - history.wrongCountOf(a.id),
      ),
    [history],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="역대 오답 목록"
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>
            역대 오답 목록{" "}
            <span className={styles.titleCount}>{entries.length}</span>
          </h2>
          <button
            type="button"
            className={styles.clearAll}
            disabled={entries.length === 0}
            onClick={() => {
              if (window.confirm("역대 오답 기록을 모두 지울까요?"))
                clearHistoryAll();
            }}
          >
            모두 지우기
          </button>
        </header>
        <p className={styles.subtitle}>
          지금까지 한 번이라도 틀렸던 모든 단어예요 — 복습 목록에서 사라져도
          여기엔 남아요
        </p>

        {entries.length === 0 ? (
          <p className={styles.empty}>아직 틀린 단어가 없어요</p>
        ) : (
          <ul className={styles.list}>
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <motion.li
                  key={entry.id}
                  className={styles.row}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.16 }}
                >
                  <span className={styles.word}>{entry.word}</span>
                  <span className={styles.meaning}>
                    {entry.senses.map((s) => s.meaning).join(" · ")}
                  </span>
                  <span className={styles.missBadge}>
                    ×{history.wrongCountOf(entry.id)}
                  </span>
                  <button
                    type="button"
                    className={styles.rowDelete}
                    aria-label={`${entry.word} 기록 삭제`}
                    onClick={() => clearHistoryWord(entry.id)}
                  >
                    ✕
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <button className={styles.close} aria-label="닫기" onClick={onClose}>
          ✕
        </button>
      </motion.div>
    </motion.div>
  );
}
