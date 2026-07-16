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
import { CATEGORIES, CATEGORY_COUNTS } from "@/data";
import { setHomePrefs, useHomePrefs } from "@/lib/homePrefs";
import type { SessionMode } from "@/lib/types";
import styles from "./Home.module.css";

interface Props {
  onStart: (mode: SessionMode, count: number, category: number) => void;
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

function renderModeCard(
  { mode, key, title, desc }: (typeof MODES)[number],
  count: number,
  onStart: (mode: SessionMode, count: number) => void,
) {
  const Icon = MODE_ICON[mode];
  return (
    <motion.button
      key={mode}
      className={styles.modeCard}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      onClick={() => onStart(mode, count)}
    >
      <span className={styles.modeIcon} aria-hidden="true">
        <Icon />
      </span>
      <span className={styles.modeTitle}>{title}</span>
      <span className={styles.modeDesc}>{desc}</span>
      <kbd className={styles.modeKey}>{key}</kbd>
    </motion.button>
  );
}

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: "easy", label: "쉬움" },
  { value: "normal", label: "보통" },
  { value: "hard", label: "어려움" },
];

function DifficultyControl({ value }: { value: Difficulty }) {
  return (
    <span className={styles.difficultyControl} role="group" aria-label="난이도">
      {DIFFICULTY_OPTIONS.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          className={styles.difficultyOption}
          aria-pressed={value === v}
          onClick={() => setDifficulty(v)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function BraceSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 28"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2,3 C2,15 40,15 56,15 C74,15 122,15 148,26 C174,15 222,15 240,15 C256,15 298,15 298,3"
        style={{ stroke: "var(--kraft)" }}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const COUNT_STEP = 5;
const COUNT_MIN = 1;

/** 한글 1자 ≈ 1em, 라틴/숫자 ≈ 0.55em — 셀렉트를 선택된 라벨 폭에 맞춘다. */
function labelEm(label: string): number {
  let em = 0;
  for (const ch of label) em += /[가-힣]/.test(ch) ? 1 : 0.55;
  return em;
}

export default function HomeScreen({ onStart, onReview, onMyWords }: Props) {
  // 카테고리·단어 수는 세션을 다녀와도 유지 — homePrefs 스토어가 든다
  const { count, category } = useHomePrefs();
  // 입력 중엔 빈 문자열·미완성 숫자를 허용해야 해서 초안을 따로 든다
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const user = useAuthUser();
  const pool = useReviewPool();
  const customWords = useCustomWords();
  const difficulty = useDifficultyPref();

  const clampCount = (n: number, cat: number) => {
    const total = CATEGORY_COUNTS.get(cat) ?? 0;
    return Math.min(Math.max(total, COUNT_MIN), Math.max(COUNT_MIN, n));
  };
  const nudgeCount = (delta: number) =>
    setHomePrefs((p) => ({ count: clampCount(p.count + delta, p.category) }));
  // 모드 카드가 쓰는 2-인자 시그니처에 현재 카테고리를 물려준다
  const startWithCategory = (mode: SessionMode, n: number) =>
    onStart(mode, n, category);

  const commitDraft = () => {
    if (countDraft === null) return;
    const n = parseInt(countDraft, 10);
    if (!Number.isNaN(n))
      setHomePrefs((p) => ({ count: clampCount(n, p.category) }));
    setCountDraft(null);
  };

  useEffect(() => {
    if (sheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 숫자 입력칸·카테고리 셀렉트에 포커스가 있으면 단축키를 끈다
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement)
        return;
      if (e.key === "1") onStart("typing", count, category);
      else if (e.key === "2") onStart("quiz", count, category);
      else if (e.key === "3") onStart("listening", count, category);
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
  }, [count, category, sheetOpen, pool.count, onStart, onReview, onMyWords, user]);

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
        <h1 className={styles.wordmark}>
          Type<span className={styles.wordmarkAccent}>See</span>
        </h1>
        <p className={styles.tagline}>타이핑하며 눈에 새기는 영단어</p>
      </header>

      <p className={styles.lesson}>
        오늘
        <span className={styles.selectWrap}>
          <select
            className={styles.categorySelect}
            aria-label="단어 카테고리"
            value={category}
            // 네이티브 select 는 가장 긴 옵션 폭으로 벌어진다 — 선택된
            // 라벨 폭 만큼으로 조인다
            style={{
              width: `calc(${labelEm(
                CATEGORIES.find((c) => c.id === category)?.label ?? "일상용어",
              )}em + 26px)`,
            }}
            onChange={(e) => {
              const next = Number(e.target.value);
              // 카테고리별 단어 수가 달라 현재 개수가 넘칠 수 있다
              setHomePrefs((p) => ({
                category: next,
                count: clampCount(p.count, next),
              }));
            }}
          >
            {CATEGORIES.map((c) => {
              const empty = (CATEGORY_COUNTS.get(c.id) ?? 0) === 0;
              return (
                <option key={c.id} value={c.id} disabled={c.soon || empty}>
                  {c.label}
                  {(c.soon || empty) && " (준비중)"}
                </option>
              );
            })}
          </select>
        </span>
        단어
        <span className={styles.countBox}>
          <button
            type="button"
            className={styles.countArrow}
            aria-label="단어 수 늘리기"
            onClick={() => nudgeCount(COUNT_STEP)}
          >
            ▲
          </button>
          <input
            className={styles.countInput}
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
            className={styles.countArrow}
            aria-label="단어 수 줄이기"
            onClick={() => nudgeCount(-COUNT_STEP)}
          >
            ▼
          </button>
        </span>
        개 배우기
      </p>

      <div className={styles.modes}>
        {renderModeCard(MODES[0], count, startWithCategory)}

        <div className={styles.quizListeningGroup}>
          <div className={styles.quizListeningCards}>
            {renderModeCard(MODES[1], count, startWithCategory)}
            {renderModeCard(MODES[2], count, startWithCategory)}
          </div>
          <BraceSvg className={styles.brace} />
          <DifficultyControl value={difficulty} />
        </div>

        <motion.button
          className={`${styles.modeCard} ${styles.reviewCard}`}
          disabled={!user || pool.count === 0}
          whileHover={user && pool.count > 0 ? { y: -3 } : undefined}
          whileTap={user && pool.count > 0 ? { scale: 0.98 } : undefined}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          onClick={onReview}
        >
          <span className={styles.modeIcon} aria-hidden="true">
            <RepeatIcon />
          </span>
          <span className={styles.modeTitle}>
            Note
            {user && pool.count > 0 && (
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
          {!user && (
            <span className={styles.lockBadge}>로그인하면 사용할 수 있어요</span>
          )}
          <span className={styles.modeDesc}>
            {pool.count > 0
              ? "틀린 단어, 저장한 단어 다시 풀기"
              : "틀리거나 저장한 단어가 여기에 모여요"}
          </span>
          {user && pool.count > 0 && <kbd className={styles.modeKey}>4</kbd>}
        </motion.button>

        <motion.button
          className={`${styles.modeCard} ${styles.reviewCard}`}
          disabled={!user}
          whileHover={user ? { y: -3 } : undefined}
          whileTap={user ? { scale: 0.98 } : undefined}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          onClick={() => (user ? onMyWords() : setSheetOpen(true))}
        >
          <span className={styles.modeIcon} aria-hidden="true">
            <NotebookIcon />
          </span>
          <span className={styles.modeTitle}>
            내 단어장
            {user && customWords.length > 0 && (
              <motion.span
                key={customWords.length}
                className={styles.reviewCount}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
              >
                {customWords.length}
              </motion.span>
            )}
          </span>
          {!user && (
            <span className={styles.lockBadge}>로그인하면 사용할 수 있어요</span>
          )}
          <span className={styles.modeDesc}>
            AI 를 이용해 내가 추가한 단어로 학습하기
          </span>
          {user && <kbd className={styles.modeKey}>5</kbd>}
        </motion.button>
      </div>

      <StreakCalendar authenticated={!!user} />

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

function HeadphoneIcon() {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
      <path
        d="M5.5 17v-3a8.5 8.5 0 0 1 17 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="16"
        width="5"
        height="7.5"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="19"
        y="16"
        width="5"
        height="7.5"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
      <rect
        x="5.5"
        y="3.5"
        width="17"
        height="21"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9.5 9h9M9.5 13.5h9M9.5 18h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5.5 7.5h-1M5.5 12h-1M5.5 16.5h-1M5.5 21h-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none">
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
