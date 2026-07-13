import { useEffect, useState, type ReactNode } from "react";
import { animate, motion } from "motion/react";
import type { SessionSummary } from "@/lib/types";
import styles from "./Result.module.css";

interface Props {
  summary: SessionSummary;
  onRetry: () => void;
  onRetryTrouble: () => void;
  onHome: () => void;
}

const RING_SIZE = 210;
const RING_STROKE = 11;
const RING_R = (RING_SIZE - RING_STROKE) / 2;

export default function ResultScreen({
  summary,
  onRetry,
  onRetryTrouble,
  onHome,
}: Props) {
  const hasTrouble = summary.troubleWords.length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") onRetry();
      else if (e.key === "Escape") onHome();
      else if (e.key.toLowerCase() === "r" && hasTrouble) onRetryTrouble();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onRetry, onRetryTrouble, onHome, hasTrouble]);

  const accuracyRate = 1 - summary.wrongRate;
  const accuracyPct = accuracyRate * 100;

  return (
    <div className={styles.screen}>
      <p className={styles.eyebrow}>
        {summary.mode === "quiz" ? "Quiz" : "Typing"} 세션 완료
      </p>

      {/* Hero — accuracy ring */}
      <div className={styles.ringWrap}>
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          role="img"
          aria-label={`정답률 ${Math.round(accuracyPct)}퍼센트`}
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            stroke="var(--accent-dim)"
            strokeWidth={RING_STROKE}
          />
          <motion.circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: accuracyRate }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className={styles.ringCenter}>
          <span className={styles.ringValue}>
            <CountUp to={accuracyPct} />
            <span className={styles.ringUnit}>%</span>
          </span>
          <span className={styles.ringLabel}>정답률</span>
        </div>
      </div>

      {/* Stat tiles */}
      <div className={styles.tiles}>
        <Tile label="타속" value={<CountUp to={summary.wpm} />} unit="WPM" />
        <Tile label="시간" value={formatElapsed(summary.elapsedMs)} />
        <Tile
          label="단어"
          value={<CountUp to={summary.totalWords} />}
          unit="개"
        />
        <Tile
          label="최고 연속"
          value={<CountUp to={summary.bestStreak} />}
          unit="단어"
        />
      </div>

      <TroubleWords summary={summary} />
      {summary.mastered.length > 0 && (
        <div className={styles.mastered}>
          <span className={styles.masteredLabel}>복습 완료</span>
          {summary.mastered.map((w) => (
            <span key={w.id} className={styles.masteredChip}>
              {w.word}
            </span>
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.primaryButton} onClick={onRetry}>
          다시하기 <kbd className={styles.kbdOnAccent}>↩</kbd>
        </button>
        {hasTrouble && (
          <button className={styles.ghostButton} onClick={onRetryTrouble}>
            틀린 단어만 다시 <kbd>R</kbd>
          </button>
        )}
        <button className={styles.ghostButton} onClick={onHome}>
          처음으로 <kbd>esc</kbd>
        </button>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>
        {value}
        {unit && <span className={styles.tileUnit}>{unit}</span>}
      </span>
    </div>
  );
}

function TroubleWords({ summary }: { summary: SessionSummary }) {
  if (summary.troubleWords.length === 0) {
    return <p className={styles.perfect}>모든 단어를 한 번에 통과했어요</p>;
  }
  return (
    <div className={styles.trouble}>
      <p className={styles.troubleTitle}>다시 볼 단어</p>
      <ul className={styles.troubleList}>
        {summary.troubleWords.map(({ entry, mistakes, gaveUp }) => (
          <li key={entry.id} className={styles.troubleRow}>
            <span className={styles.troubleWord}>{entry.word}</span>
            <span className={styles.troubleMeaning}>
              {entry.senses.map((s) => s.meaning).join(" · ")}
            </span>
            <span className={styles.troubleBadges}>
              {gaveUp && <span className={styles.hintBadge}>정답 봄</span>}
              {mistakes > 0 && (
                <span className={styles.missBadge}>×{mistakes}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Animated counter — proportional figures, rounds to integer */
function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, {
      duration: 1.0,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setValue,
    });
    return () => controls.stop();
  }, [to]);
  return <>{Math.round(value)}</>;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}초`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min}분` : `${min}분 ${sec}초`;
}
