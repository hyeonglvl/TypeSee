import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ALL_WORDS } from "@/data";
import {
  clearAll,
  clearSavedWord,
  clearWrongWord,
  easeStage,
  useReviewPool,
  type EaseStageTone,
} from "@/lib/reviewStore";
import { useAuthUser } from "@/lib/auth";
import HistorySheet from "@/screens/HistorySheet";
import type { SessionMode, WordEntry } from "@/lib/types";
import styles from "./Review.module.css";

interface Props {
  onStart: (mode: SessionMode, words: WordEntry[]) => void;
  onBack: () => void;
}

const STAGE_CLASS: Record<EaseStageTone, string> = {
  weak: styles.stageWeak,
  wary: styles.stageWary,
  stable: styles.stageStable,
  done: styles.stageDone,
};

export default function ReviewScreen({ onStart, onBack }: Props) {
  const pool = useReviewPool();
  const user = useAuthUser();
  const [historyOpen, setHistoryOpen] = useState(false);

  const entries = useMemo(
    () =>
      ALL_WORDS.filter((w) => pool.ids.has(w.id)).sort(
        (a, b) => pool.wrongCountOf(b.id) - pool.wrongCountOf(a.id),
      ),
    [pool],
  );

  const wrongCount = entries.filter(
    (w) => pool.wrongCountOf(w.id) > 0,
  ).length;
  const savedCount = entries.filter((w) => pool.isSaved(w.id)).length;

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
          {wrongCount} · 저장한 단어 {savedCount} · 누적 오타 {totalWrong}회
          {pool.retainedIds.size > 0 && <> · 마스터 {pool.retainedIds.size}개</>}
          {" · "}
          {user
            ? "계정에 저장되었어요"
            : "로그인하면 이 목록이 계정에 저장돼요"}
        </p>
      </header>

      {/* 틀린 단어·저장 단어를 나누지 않고 단어별 카드 하나에 그 단어의
          기록(틀린 횟수·저장 여부·익힘 단계)을 모두 보여준다.
          호버하면 예문·해석이 카드 위에 떠오른다. */}
      <ul className={styles.grid}>
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            const wrong = pool.wrongCountOf(entry.id);
            const saved = pool.isSaved(entry.id);
            const stage = easeStage(pool.easeOf(entry.id));
            return (
              <motion.li
                key={entry.id}
                className={styles.card}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <span className={`${styles.stage} ${STAGE_CLASS[stage.tone]}`}>
                  {stage.label}
                </span>
                <span className={styles.word}>{entry.word}</span>
                <span className={styles.meaning}>
                  {entry.senses.map((s) => s.meaning).join(" · ")}
                </span>
                <span className={styles.cardBadges}>
                  {wrong > 0 && (
                    <span className={styles.missBadge}>틀림 ×{wrong}</span>
                  )}
                  {saved && <span className={styles.savedBadge}>저장</span>}
                  {pool.isRevealed(entry.id) && (
                    <span className={styles.revealBadge}>정답 봄</span>
                  )}
                </span>
                {entry.example && entry.example.length > 0 && (
                  <span className={styles.example} aria-hidden="true">
                    {entry.example.map((ex, exIdx) => (
                      <span key={exIdx} className={styles.examplePair}>
                        <span className={styles.exampleEn}>{ex}</span>
                        {entry.exampleMeaning?.[exIdx] && (
                          <span className={styles.exampleKo}>
                            {entry.exampleMeaning[exIdx]}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                <button
                  type="button"
                  className={styles.rowDelete}
                  aria-label={`${entry.word} 복습 기록 삭제`}
                  onClick={() => {
                    clearWrongWord(entry.id);
                    clearSavedWord(entry.id);
                  }}
                >
                  ✕
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

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
