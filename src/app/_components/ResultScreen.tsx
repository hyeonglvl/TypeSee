import type { SessionSummary } from "@/lib/types";
import styles from "./ResultScreen.module.css";

interface Props {
  summary: SessionSummary;
  onRestart: () => void;
}

export default function ResultScreen({ summary, onRestart }: Props) {
  const seconds = Math.round(summary.elapsedMs / 1000);

  return (
    <div className={styles.screen}>
      <h2 className={styles.heading}>세션 완료</h2>
      <div className={styles.stats}>
        <Stat label="단어" value={`${summary.totalWords}개`} />
        <Stat label="정확도" value={`${Math.round(summary.accuracy * 100)}%`} />
        <Stat label="소요 시간" value={`${seconds}초`} />
      </div>
      <button className={styles.restartButton} onClick={onRestart}>
        다시하기
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
