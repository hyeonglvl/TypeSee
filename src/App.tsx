import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import HomeScreen from "@/screens/Home";
import SessionScreen from "@/screens/Session";
import ResultScreen from "@/screens/Result";
import ReviewScreen from "@/screens/Review";
import { STARTER_WORDS } from "@/data/words";
import { shuffle, weightedSample } from "@/lib/engine";
import { useAuthUser } from "@/lib/auth";
import {
  attachUser,
  detachUser,
  hydrateLocal,
  recordSession,
  sessionWeight,
  timeWeight,
  useReviewPool,
} from "@/lib/reviewStore";
import {
  attachUser as attachStreakUser,
  detachUser as detachStreakUser,
  recordDailyActivity,
} from "@/lib/streakStore";
import type { SessionMode, SessionSummary, WordEntry } from "@/lib/types";

type SessionConfig =
  | { kind: "normal"; mode: SessionMode; count: number }
  | { kind: "review"; mode: SessionMode };

type Phase =
  | { step: "home" }
  | { step: "review" }
  | {
      step: "session";
      words: WordEntry[];
      mode: SessionMode;
      reviewIds: ReadonlySet<string>;
      retentionIds: ReadonlySet<string>;
      config: SessionConfig;
    }
  | { step: "result"; summary: SessionSummary; config: SessionConfig };

const REVIEW_MIX_RATIO = 3; // up to 1/3 of a normal session comes from the pool
// 마스터 유지 점검: 마스터한 지·마지막으로 본 지 이 기간이 지난 단어만
// 일반 세션의 fresh 몫에서 한두 개 재출현시켜 아직 기억하는지 확인한다.
const RETENTION_MIN_MS = 3 * 86_400_000;
const EMPTY_IDS: ReadonlySet<string> = new Set();

const screenMotion = {
  initial: { opacity: 0, y: 14, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.99 },
  transition: { type: "spring", stiffness: 300, damping: 32 },
} as const;

export default function App() {
  const [phase, setPhase] = useState<Phase>({ step: "home" });
  const user = useAuthUser();
  const pool = useReviewPool();

  // localStorage 백업 복원 — SSR HTML과 첫 렌더가 일치하도록 마운트 후에
  useEffect(() => {
    hydrateLocal();
  }, []);

  useEffect(() => {
    if (user) {
      attachUser(user.id);
      attachStreakUser(user.id);
    } else {
      detachUser();
      detachStreakUser();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNormal = useCallback(
    (mode: SessionMode, count: number) => {
      // TS-1: 복습 몫은 ease 가 낮은(자주 틀리는) 단어일수록, 그리고 오래
      // 안 본 단어일수록 잘 뽑히고, 직전 세션에서 막 정타 통과한 단어는
      // 한 세션 쉰다.
      const now = Date.now();
      const fromPool = weightedSample(
        STARTER_WORDS.filter(
          (w) => pool.ids.has(w.id) && !pool.inCooldown(w.id),
        ),
        (w) => sessionWeight(pool.easeOf(w.id), pool.lastSeenAtOf(w.id), now),
        Math.floor(count / REVIEW_MIX_RATIO),
      );
      const pickedIds = new Set(fromPool.map((w) => w.id));

      // 마스터 유지 점검: 오래 안 본 마스터 단어를 배지 없이(블라인드) 섞어
      // 아직 기억하는지 확인한다. fresh 몫을 대체하므로 복습 1/3 몫은 그대로.
      const retention = weightedSample(
        STARTER_WORDS.filter((w) => {
          const masteredAt = pool.masteredAtOf(w.id);
          if (masteredAt === null || pool.inCooldown(w.id)) return false;
          const seen = pool.lastSeenAtOf(w.id) ?? masteredAt;
          return (
            now - masteredAt >= RETENTION_MIN_MS &&
            now - seen >= RETENTION_MIN_MS
          );
        }),
        (w) => timeWeight(pool.lastSeenAtOf(w.id), now),
        count >= 20 ? 2 : 1,
      );
      const retentionIds: ReadonlySet<string> = new Set(
        retention.map((w) => w.id),
      );

      const fresh = shuffle(
        STARTER_WORDS.filter(
          (w) => !pickedIds.has(w.id) && !retentionIds.has(w.id),
        ),
      ).slice(0, count - fromPool.length - retention.length);

      setPhase({
        step: "session",
        words: shuffle([...fromPool, ...retention, ...fresh]),
        mode,
        // 유지 점검 단어도 reviewIds 에 넣어야 클린 통과가 summary.mastered 를
        // 거쳐 recordSession 의 유지-통과 분기로 흐른다.
        reviewIds: new Set([...pool.ids, ...retentionIds]),
        retentionIds,
        config: { kind: "normal", mode, count },
      });
    },
    [pool],
  );

  const startReview = useCallback(
    (mode: SessionMode, entries?: WordEntry[]) => {
      const words =
        entries ?? STARTER_WORDS.filter((w) => pool.ids.has(w.id));
      if (words.length === 0) return;
      setPhase({
        step: "session",
        words: shuffle(words),
        mode,
        reviewIds: new Set(words.map((w) => w.id)),
        retentionIds: EMPTY_IDS,
        config: { kind: "review", mode },
      });
    },
    [pool],
  );

  const record = useCallback((summary: SessionSummary) => {
    recordSession(
      // 틀린 단어로는 실제 오타가 있는 단어만 쌓는다 — 정답 보기(Space)로
      // 저장만 한 단어는 저장 기록으로만 남고, 힌트·뜻 열람도 라벨용일 뿐
      // 오답이 아니다.
      summary.troubleWords
        .filter((t) => t.mistakes > 0)
        .map((t) => ({
          id: t.entry.id,
          count: t.mistakes,
        })),
      summary.mastered.map((w) => w.id),
    );
    recordDailyActivity(summary.wordsCompleted);
  }, []);

  const goHome = useCallback(() => setPhase({ step: "home" }), []);

  return (
    <AnimatePresence mode="wait">
      {phase.step === "home" && (
        <motion.div key="home" style={{ height: "100%" }} {...screenMotion}>
          <HomeScreen
            totalWords={STARTER_WORDS.length}
            onStart={startNormal}
            onReview={() => setPhase({ step: "review" })}
          />
        </motion.div>
      )}
      {phase.step === "review" && (
        <motion.div key="review" style={{ height: "100%" }} {...screenMotion}>
          <ReviewScreen
            onStart={(mode, words) => startReview(mode, words)}
            onBack={goHome}
          />
        </motion.div>
      )}
      {phase.step === "session" && (
        <motion.div key="session" style={{ height: "100%" }} {...screenMotion}>
          <SessionScreen
            words={phase.words}
            mode={phase.mode}
            reviewIds={phase.reviewIds}
            retentionIds={phase.retentionIds}
            onExit={(summary) => {
              record(summary);
              goHome();
            }}
            onFinish={(summary) => {
              record(summary);
              setPhase({ step: "result", summary, config: phase.config });
            }}
          />
        </motion.div>
      )}
      {phase.step === "result" && (
        <motion.div key="result" style={{ height: "100%" }} {...screenMotion}>
          <ResultScreen
            summary={phase.summary}
            onRetry={() => {
              if (phase.config.kind === "normal")
                startNormal(phase.config.mode, phase.config.count);
              else if (pool.count > 0) startReview(phase.config.mode);
              else goHome();
            }}
            onRetryTrouble={() =>
              startReview(
                "quiz",
                phase.summary.troubleWords.map((t) => t.entry),
              )
            }
            onHome={goHome}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
