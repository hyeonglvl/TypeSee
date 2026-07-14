import { useEffect, useMemo, useRef } from "react";
import { localDateKey, useStreak } from "@/lib/streakStore";
import styles from "./StreakCalendar.module.css";

interface Props {
  authenticated: boolean;
}

const WEEKS = 26;
const MONTH_LABEL = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

interface Cell {
  key: string;
  date: Date;
  col: number;
  row: number;
}

interface MonthLabel {
  col: number;
  text: string;
}

function buildGrid(): {
  cells: Cell[];
  months: MonthLabel[];
  yearLabel: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay());
  const gridStart = new Date(currentWeekStart);
  gridStart.setDate(currentWeekStart.getDate() - 7 * (WEEKS - 1));

  const cells: Cell[] = [];
  const months: MonthLabel[] = [];
  let lastMonth = -1;

  for (let col = 0; col < WEEKS; col++) {
    const weekStart = new Date(gridStart);
    weekStart.setDate(gridStart.getDate() + 7 * col);
    if (weekStart.getMonth() !== lastMonth) {
      lastMonth = weekStart.getMonth();
      months.push({ col, text: MONTH_LABEL[lastMonth] });
    }
    for (let row = 0; row < 7; row++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + row);
      if (date > today) continue;
      cells.push({ key: localDateKey(date), date, col, row });
    }
  }

  // 스크롤 위치와 무관하게 보이는 캡션 — 범위가 해를 걸치면 둘 다 표기
  const startYear = gridStart.getFullYear();
  const endYear = today.getFullYear();
  const yearLabel =
    startYear === endYear ? `${endYear}년` : `${startYear}–${endYear}년`;

  return { cells, months, yearLabel };
}

function bucket(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export default function StreakCalendar({ authenticated }: Props) {
  const streak = useStreak();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { cells, months, yearLabel } = useMemo(buildGrid, []);

  const max = useMemo(() => {
    if (!authenticated) return 0;
    let m = 0;
    for (const c of cells) m = Math.max(m, streak.byDate.get(c.key) ?? 0);
    return m;
  }, [authenticated, cells, streak]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div className={styles.wrap}>
      <span className={styles.yearLabel}>{yearLabel}</span>
      <div
        className={`${styles.scroller} ${!authenticated ? styles.dim : ""}`}
        ref={scrollerRef}
      >
        <div className={styles.months}>
          {months.map((m) => (
            <span
              key={m.col}
              className={styles.monthLabel}
              style={{ gridColumn: m.col + 1 }}
            >
              {m.text}
            </span>
          ))}
        </div>
        <div className={styles.grid}>
          {cells.map((c) => {
            const count = authenticated ? streak.byDate.get(c.key) ?? 0 : 0;
            const level = authenticated ? bucket(count, max) : 0;
            return (
              <div
                key={c.key}
                className={`${styles.cell} ${styles[`level${level}`]}`}
                style={{ gridColumn: c.col + 1, gridRow: c.row + 1 }}
                title={`${c.key} · ${count}개`}
              >
                {authenticated && count > 0 && count}
              </div>
            );
          })}
        </div>
      </div>

      {!authenticated && (
        <div className={styles.guestOverlay}>
          <p>로그인을 하면 Streak 기록을 볼 수 있습니다</p>
        </div>
      )}
    </div>
  );
}
