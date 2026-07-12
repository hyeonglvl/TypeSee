import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  displayName,
  isAuthAvailable,
  signOut,
  useAuthUser,
} from "@/lib/auth";
import { useReviewPool } from "@/lib/reviewStore";
import AuthSheet from "@/screens/AuthSheet";
import StreakCalendar from "@/screens/StreakCalendar";
import type { SessionMode } from "@/lib/types";
import styles from "./Home.module.css";

interface Props {
  totalWords: number;
  onStart: (mode: SessionMode, count: number) => void;
  onReview: () => void;
}

const MODES: Array<{
  mode: SessionMode;
  key: string;
  title: string;
  desc: string;
}> = [
  { mode: "typing", key: "1", title: "Typing", desc: "단어를 보며 손에 익히기" },
  { mode: "quiz", key: "2", title: "Quiz", desc: "뜻만 보고 철자 떠올리기" },
];

const CUSTOM_STEP = 10;
const CUSTOM_MIN = 10;

export default function HomeScreen({ totalWords, onStart, onReview }: Props) {
  const [customCount, setCustomCount] = useState(() =>
    Math.min(50, totalWords),
  );
  const counts = [10, 20, customCount];
  const [countIdx, setCountIdx] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const user = useAuthUser();
  const pool = useReviewPool();

  const nudgeCustom = (delta: number) =>
    setCustomCount((c) =>
      Math.min(totalWords, Math.max(CUSTOM_MIN, c + delta)),
    );

  useEffect(() => {
    if (sheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "1") onStart("typing", counts[countIdx]);
      else if (e.key === "2") onStart("quiz", counts[countIdx]);
      else if ((e.key === "3" || e.key.toLowerCase() === "r") && pool.count > 0)
        onReview();
      else if (e.key === "ArrowLeft")
        setCountIdx((i) => (i + counts.length - 1) % counts.length);
      else if (e.key === "ArrowRight")
        setCountIdx((i) => (i + 1) % counts.length);
      else if (e.key === "Tab") {
        e.preventDefault();
        setCountIdx((i) =>
          e.shiftKey
            ? (i + counts.length - 1) % counts.length
            : (i + 1) % counts.length,
        );
      } else if (e.key === "ArrowUp" && countIdx === 2) {
        e.preventDefault();
        nudgeCustom(CUSTOM_STEP);
      } else if (e.key === "ArrowDown" && countIdx === 2) {
        e.preventDefault();
        nudgeCustom(-CUSTOM_STEP);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countIdx, sheetOpen, pool.count, onStart, onReview, customCount]);

  return (
    <div className={styles.screen}>
      <div className={styles.accountArea}>
        {user ? (
          <>
            <span className={styles.userChip}>
              <UserIcon />
              {displayName(user)}
            </span>
            <button
              className={styles.accountButton}
              onClick={() => signOut().catch(console.error)}
            >
              로그아웃
            </button>
          </>
        ) : (
          isAuthAvailable() && (
            <button
              className={styles.accountButton}
              onClick={() => setSheetOpen(true)}
            >
              로그인
            </button>
          )
        )}
      </div>

      <header className={styles.hero}>
        <h1 className={styles.wordmark}>TypeSee</h1>
        <p className={styles.tagline}>타이핑하며 눈에 새기는 영단어</p>
      </header>

      <div
        className={styles.segment}
        role="radiogroup"
        aria-label="단어 수 선택"
      >
        {[10, 20].map((count, i) => (
          <button
            key={count}
            type="button"
            role="radio"
            aria-checked={i === countIdx}
            className={styles.segmentItem}
            onClick={() => setCountIdx(i)}
          >
            {i === countIdx && (
              <motion.span
                layoutId="segment-thumb"
                className={styles.segmentThumb}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className={styles.segmentLabel}>{count}</span>
          </button>
        ))}

        <div
          role="radio"
          aria-checked={countIdx === 2}
          tabIndex={0}
          className={`${styles.segmentItem} ${styles.segmentCustomItem}`}
          onClick={() => setCountIdx(2)}
        >
          {countIdx === 2 && (
            <motion.span
              layoutId="segment-thumb"
              className={styles.segmentThumb}
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <span className={styles.segmentCustom}>
            <button
              type="button"
              className={styles.stepper}
              aria-label="단어 수 줄이기"
              onClick={(e) => {
                e.stopPropagation();
                setCountIdx(2);
                nudgeCustom(-CUSTOM_STEP);
              }}
            >
              −
            </button>
            <span className={styles.segmentLabel}>
              {customCount} / {totalWords}
            </span>
            <button
              type="button"
              className={styles.stepper}
              aria-label="단어 수 늘리기"
              onClick={(e) => {
                e.stopPropagation();
                setCountIdx(2);
                nudgeCustom(CUSTOM_STEP);
              }}
            >
              +
            </button>
          </span>
        </div>
      </div>

      <div className={styles.modes}>
        {MODES.map(({ mode, key, title, desc }) => (
          <motion.button
            key={mode}
            className={styles.modeCard}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            onClick={() => onStart(mode, counts[countIdx])}
          >
            <span className={styles.modeIcon} aria-hidden="true">
              {mode === "typing" ? <KeyboardIcon /> : <SparkIcon />}
            </span>
            <span className={styles.modeTitle}>{title}</span>
            <span className={styles.modeDesc}>{desc}</span>
            <kbd className={styles.modeKey}>{key}</kbd>
          </motion.button>
        ))}

        <motion.button
          className={`${styles.modeCard} ${styles.reviewCard}`}
          disabled={pool.count === 0}
          whileHover={pool.count > 0 ? { y: -3 } : undefined}
          whileTap={pool.count > 0 ? { scale: 0.98 } : undefined}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          onClick={onReview}
        >
          <span className={styles.modeIcon} aria-hidden="true">
            <RepeatIcon />
          </span>
          <span className={styles.modeTitle}>
            복습
            {pool.count > 0 && (
              <motion.span
                key={pool.count}
                className={styles.reviewCount}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
              >
                {pool.count}
              </motion.span>
            )}
          </span>
          <span className={styles.modeDesc}>
            {pool.count > 0
              ? "틀린 단어, 저장한 단어 다시 풀기"
              : "틀리거나 저장한 단어가 여기에 모여요"}
          </span>
          {pool.count > 0 && <kbd className={styles.modeKey}>3</kbd>}
        </motion.button>
      </div>

      <StreakCalendar authenticated={!!user} />

      <p className={styles.footHint}>
        <kbd>tab</kbd> <kbd>←</kbd> <kbd>→</kbd> 단어 수
        {countIdx === 2 && (
          <>
            &nbsp;·&nbsp; <kbd>↑</kbd> <kbd>↓</kbd> 갯수 조절
          </>
        )}
        &nbsp;·&nbsp; <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 바로 시작
        {!user && pool.count > 0 && (
          <span className={styles.volatileNote}>
            &nbsp;·&nbsp; 로그인하면 틀린 단어가 저장돼요
          </span>
        )}
      </p>

      <AnimatePresence>
        {sheetOpen && <AuthSheet onClose={() => setSheetOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
      <rect
        x="2.5"
        y="7"
        width="23"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M6.5 11h1.5M11 11h1.5M15.5 11h1.5M20 11h1.5M6.5 14.5h1.5M11 14.5h1.5M15.5 14.5h1.5M20 14.5h1.5M9 17.8h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
      <path
        d="M14 3.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9L3.5 14l7.9-2.6L14 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
      <path
        d="M7 10.5h12.5a3 3 0 0 1 3 3v1M21 17.5H8.5a3 3 0 0 1-3-3v-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17.5 7l3 3.5-3 3.5M10.5 14l-3 3.5 3 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none">
      <circle cx="10" cy="6.5" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 17c1.2-3.2 3.9-4.8 6.5-4.8s5.3 1.6 6.5 4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
