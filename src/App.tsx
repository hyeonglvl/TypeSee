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
  appearanceWeight,
  attachUser,
  detachUser,
  hydrateLocal,
  recordSession,
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
      config: SessionConfig;
    }
  | { step: "result"; summary: SessionSummary; config: SessionConfig };

const REVIEW_MIX_RATIO = 3; // up to 1/3 of a normal session comes from the pool

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
      // TS-1: 복습 몫은 ease 가 낮은(자주 틀리는) 단어일수록 잘 뽑히고,
      // 직전 세션에서 막 정타 통과한 단어는 한 세션 쉰다.
      const fromPool = weightedSample(
        STARTER_WORDS.filter(
          (w) => pool.ids.has(w.id) && !pool.inCooldown(w.id),
        ),
        (w) => appearanceWeight(pool.easeOf(w.id)),
        Math.floor(count / REVIEW_MIX_RATIO),
      );
      const pickedIds = new Set(fromPool.map((w) => w.id));
      const fresh = shuffle(
        STARTER_WORDS.filter((w) => !pickedIds.has(w.id)),
      ).slice(0, count - fromPool.length);

      setPhase({
        step: "session",
        words: shuffle([...fromPool, ...fresh]),
        mode,
        reviewIds: pool.ids,
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
        config: { kind: "review", mode },
      });
    },
    [pool],
  );

  const record = useCallback((summary: SessionSummary) => {
    recordSession(
      summary.troubleWords.map((t) => ({
        id: t.entry.id,
        count: Math.max(1, t.mistakes),
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
