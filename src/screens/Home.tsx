import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { displayName, isAuthAvailable, signOut, useAuthUser } from "@/lib/auth";
import { useReviewPool } from "@/lib/reviewStore";
import { useCustomWords } from "@/lib/customWordsStore";
import {
  setDifficulty,
  useDifficultyPref,
  type Difficulty,
} from "@/lib/difficultyPref";
import AuthSheet from "@/screens/AuthSheet";
import StreakCalendar from "@/screens/StreakCalendar";
import type { SessionMode } from "@/lib/types";
import styles from "./Home.module.css";

interface Props {
  totalWords: number;
  onStart: (mode: SessionMode, count: number) => void;
  onReview: () => void;
  onMyWords: () => void;
}

const MODES: Array<{
  mode: SessionMode;
  key: string;
  title: string;
  desc: string;
}> = [
  {
    mode: "typing",
    key: "1",
    title: "Typing",
    desc: "단어를 보며 손에 익히기",
  },
  { mode: "quiz", key: "2", title: "Quiz", desc: "뜻만 보고 철자 떠올리기" },
  {
    mode: "listening",
    key: "3",
    title: "Listening",
    desc: "발음만 듣고 철자 입력",
  },
];

const MODE_ICON: Record<SessionMode, () => React.JSX.Element> = {
  typing: KeyboardIcon,
  quiz: SparkIcon,
  listening: HeadphoneIcon,
};

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: "easy", label: "쉬움" },
  { value: "normal", label: "보통" },
  { value: "hard", label: "어려움" },
];

function DifficultyControl({ value }: { value: Difficulty }) {
  return (
    <span className={styles.segmented} role="group" aria-label="난이도">
      {DIFFICULTY_OPTIONS.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          className={styles.segBtn}
          aria-pressed={value === v}
          onClick={() => setDifficulty(v)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

const COUNT_DEFAULT = 10;
const COUNT_STEP = 5;
const COUNT_MIN = 1;

// 단어셋은 추후 추가 예정 — 현재 수록 단어는 실생활 카테고리로 취급.
// 실생활이 목록 가운데쯤 오도록 배치한다 (기본 선택은 그대로 실생활).
const CATEGORIES = [
  { id: "toeic", label: "토익", soon: true },
  { id: "business", label: "비즈니스", soon: true },
  { id: "daily", label: "실생활" },
  { id: "science", label: "과학", soon: true },
];

export default function HomeScreen({
  totalWords,
  onStart,
  onReview,
  onMyWords,
}: Props) {
  const [count, setCount] = useState(COUNT_DEFAULT);
  // 입력 중엔 빈 문자열·미완성 숫자를 허용해야 해서 초안을 따로 든다
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [category, setCategory] = useState("daily");
  const [sheetOpen, setSheetOpen] = useState(false);
  const user = useAuthUser();
  const pool = useReviewPool();
  const customWords = useCustomWords();
  const difficulty = useDifficultyPref();

  const clampCount = (n: number) =>
    Math.min(totalWords, Math.max(COUNT_MIN, n));
  const nudgeCount = (delta: number) => setCount((c) => clampCount(c + delta));

  const commitDraft = () => {
    if (countDraft === null) return;
    const n = parseInt(countDraft, 10);
    if (!Number.isNaN(n)) setCount(clampCount(n));
    setCountDraft(null);
  };

  useEffect(() => {
    if (sheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 숫자 입력칸·카테고리 셀렉트에 포커스가 있으면 단축키를 끈다
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement)
        return;
      if (e.key === "1") onStart("typing", count);
      else if (e.key === "2") onStart("quiz", count);
      else if (e.key === "3") onStart("listening", count);
      else if (
        (e.key === "4" || e.key.toLowerCase() === "r") &&
        user &&
        pool.count > 0
      )
        onReview();
      else if (e.key === "5" && user) onMyWords();
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeCount(COUNT_STEP);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeCount(-COUNT_STEP);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, sheetOpen, pool.count, onStart, onReview, onMyWords, user]);

  const modeRow = ({ mode, key, title, desc }: (typeof MODES)[number]) => {
    const Icon = MODE_ICON[mode];
    return (
      <button
        key={mode}
        type="button"
        className={styles.row}
        onClick={() => onStart(mode, count)}
      >
        <span className={styles.rowIcon} aria-hidden="true">
          <Icon />
        </span>
        <span className={styles.rowBody}>
          <span className={styles.rowTitle}>{title}</span>
          <span className={styles.rowDesc}>{desc}</span>
        </span>
        <span className={styles.rowMeta}>
          <kbd>{key}</kbd>
        </span>
      </button>
    );
  };

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <span className={styles.brand}>
          Type<span className={styles.brandAccent}>See</span>
        </span>
        <span className={styles.topActions}>
          {user ? (
            <>
              <span className={styles.userName}>
                <UserIcon />
                {displayName(user)}
              </span>
              <button
                className={styles.textButton}
                onClick={() => signOut().catch(console.error)}
              >
                로그아웃
              </button>
            </>
          ) : (
            isAuthAvailable() && (
              <button
                className={styles.textButton}
                onClick={() => setSheetOpen(true)}
              >
                로그인
              </button>
            )
          )}
        </span>
      </header>

      <main className={styles.main}>
        <p className={styles.composer}>
          오늘
          <select
            className={styles.composerSelect}
            aria-label="단어 카테고리"
            value={category}
            // 네이티브 select 는 가장 긴 옵션 폭으로 벌어진다 — 선택된
            // 라벨 폭(한글 1자 ≈ 1em) 만큼으로 조인다
            style={{
              width: `calc(${
                CATEGORIES.find((c) => c.id === category)?.label.length ?? 3
              }em + 20px)`,
            }}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} disabled={c.soon}>
                {c.label}
                {c.soon && " (준비중)"}
              </option>
            ))}
          </select>
          단어
          <span className={styles.countBox}>
            <button
              type="button"
              className={styles.stepBtn}
              aria-label="단어 수 줄이기"
              onClick={() => nudgeCount(-COUNT_STEP)}
            >
              ▼
            </button>
            <input
              className={styles.countField}
              type="text"
              inputMode="numeric"
              aria-label="단어 수"
              value={countDraft ?? String(count)}
              style={{
                width: `${Math.max(2, (countDraft ?? String(count)).length)}ch`,
              }}
              onChange={(e) =>
                setCountDraft(e.target.value.replace(/\D/g, "").slice(0, 3))
              }
              onFocus={(e) => e.target.select()}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  commitDraft();
                  nudgeCount(COUNT_STEP);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  commitDraft();
                  nudgeCount(-COUNT_STEP);
                }
              }}
            />
            <button
              type="button"
              className={styles.stepBtn}
              aria-label="단어 수 늘리기"
              onClick={() => nudgeCount(COUNT_STEP)}
            >
              ▲
            </button>
          </span>
          개 배우기
        </p>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>학습 모드</span>
          <div className={styles.list}>
            {modeRow(MODES[0])}
            {modeRow(MODES[1])}
            {modeRow(MODES[2])}
            <div className={styles.difficultyRow}>
              <span className={styles.difficultyLabel}>
                Quiz · Listening 난이도
              </span>
              <DifficultyControl value={difficulty} />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>보관함</span>
          <div className={styles.list}>
            <button
              type="button"
              className={styles.row}
              disabled={!user || pool.count === 0}
              onClick={onReview}
            >
              <span className={styles.rowIcon} aria-hidden="true">
                <RepeatIcon />
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>
                  Note
                  {user && pool.count > 0 && (
                    <motion.span
                      key={pool.count}
                      className={styles.countPill}
                      initial={{ scale: 1.3 }}
                      animate={{ scale: 1 }}
                    >
                      {pool.count}
                    </motion.span>
                  )}
                </span>
                <span className={styles.rowDesc}>
                  {pool.count > 0
                    ? "틀린 단어, 저장한 단어 다시 풀기"
                    : "틀리거나 저장한 단어가 여기에 모여요"}
                </span>
              </span>
              <span className={styles.rowMeta}>
                {!user && (
                  <span className={styles.lockChip}>로그인 필요</span>
                )}
                {user && pool.count > 0 && <kbd>4</kbd>}
              </span>
            </button>

            <button
              type="button"
              className={styles.row}
              disabled={!user}
              onClick={() => (user ? onMyWords() : setSheetOpen(true))}
            >
              <span className={styles.rowIcon} aria-hidden="true">
                <NotebookIcon />
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>
                  내 단어장
                  {user && customWords.length > 0 && (
                    <motion.span
                      key={customWords.length}
                      className={styles.countPill}
                      initial={{ scale: 1.3 }}
                      animate={{ scale: 1 }}
                    >
                      {customWords.length}
                    </motion.span>
                  )}
                </span>
                <span className={styles.rowDesc}>
                  AI 를 이용해 내가 추가한 단어로 학습하기
                </span>
              </span>
              <span className={styles.rowMeta}>
                {!user && (
                  <span className={styles.lockChip}>로그인 필요</span>
                )}
                {user && <kbd>5</kbd>}
              </span>
            </button>
          </div>
        </section>

        <StreakCalendar authenticated={!!user} />
      </main>

      <p className={styles.footHint}>
        <kbd>↑</kbd> <kbd>↓</kbd> 단어 수 &nbsp;·&nbsp; <kbd>1</kbd>{" "}
        <kbd>2</kbd> <kbd>3</kbd>
        {user && (
          <>
            {" "}
            <kbd>4</kbd> <kbd>5</kbd>
          </>
        )}{" "}
        바로 시작
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
    <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
      <rect
        x="2.5"
        y="7"
        width="23"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6.5 11h1.5M11 11h1.5M15.5 11h1.5M20 11h1.5M6.5 14.5h1.5M11 14.5h1.5M15.5 14.5h1.5M20 14.5h1.5M9 17.8h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
      <path
        d="M14 3.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9L3.5 14l7.9-2.6L14 3.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
      <path
        d="M7 10.5h12.5a3 3 0 0 1 3 3v1M21 17.5H8.5a3 3 0 0 1-3-3v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17.5 7l3 3.5-3 3.5M10.5 14l-3 3.5 3 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeadphoneIcon() {
  return (
    <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
      <path
        d="M5.5 17v-3a8.5 8.5 0 0 1 17 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="16"
        width="5"
        height="7.5"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="19"
        y="16"
        width="5"
        height="7.5"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
      <rect
        x="5.5"
        y="3.5"
        width="17"
        height="21"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9.5 9h9M9.5 13.5h9M9.5 18h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5.5 7.5h-1M5.5 12h-1M5.5 16.5h-1M5.5 21h-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
      <circle
        cx="10"
        cy="6.5"
        r="3.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.5 17c1.2-3.2 3.9-4.8 6.5-4.8s5.3 1.6 6.5 4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
