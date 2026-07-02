"use client";

import { useState } from "react";
import IntroScreen from "./_components/IntroScreen";
import TypingScreen from "./_components/TypingScreen";
import ResultScreen from "./_components/ResultScreen";
import LoginScreen from "./_components/LoginScreen";
import type { SessionMode, SessionSummary, WordEntry } from "@/lib/types";
import { useSupabaseUsername } from "@/lib/useSupabaseUsername";
import { signOut } from "@/lib/auth";
import styles from "./page.module.css";

type Phase =
  | { step: "intro" }
  | { step: "typing"; words: WordEntry[]; mode: SessionMode }
  | { step: "result"; summary: SessionSummary }
  | { step: "login" };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ step: "intro" });
  const username = useSupabaseUsername();

  const handleStart = (words: WordEntry[], mode: SessionMode) => {
    setPhase({ step: "typing", words, mode });
  };

  const handleFinish = (summary: SessionSummary) => {
    setPhase({ step: "result", summary });
  };

  const handleRestart = () => {
    setPhase({ step: "intro" });
  };

  const handleExit = () => {
    setPhase({ step: "intro" });
  };

  const handleUserIconClick = () => {
    setPhase({ step: "login" });
  };

  const handleLogout = () => {
    signOut().catch((err) => console.error("Failed to sign out:", err));
  };

  const handleLoginBack = () => {
    setPhase({ step: "intro" });
  };

  const handleAuthSuccess = () => {
    setPhase({ step: "intro" });
  };

  return (
    <div className={styles.app}>
      {phase.step !== "login" && (
        <div className={styles.userArea}>
          {username && (
            <>
              <span className={styles.username}>{username}</span>
              <button
                type="button"
                className={styles.logoutButton}
                onClick={handleLogout}
              >
                로그아웃
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.userIconButton}
            aria-label="Account"
            onClick={handleUserIconClick}
          >
            <UserIcon />
          </button>
        </div>
      )}
      {phase.step === "intro" && <IntroScreen onStart={handleStart} />}
      {phase.step === "typing" && (
        <TypingScreen
          words={phase.words}
          mode={phase.mode}
          onFinish={handleFinish}
          onExit={handleExit}
        />
      )}
      {phase.step === "result" && (
        <ResultScreen summary={phase.summary} onRestart={handleRestart} />
      )}
      {phase.step === "login" && (
        <LoginScreen onBack={handleLoginBack} onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 20c1.5-4 4.8-6 8-6s6.5 2 8 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
