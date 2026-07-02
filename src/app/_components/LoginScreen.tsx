"use client";

import { useState, type FormEvent } from "react";
import { signInWithUsername, signUpWithUsername } from "@/lib/auth";
import styles from "./LoginScreen.module.css";

interface Props {
  onBack: () => void;
  onAuthSuccess: () => void;
}

type Mode = "signin" | "signup";

export default function LoginScreen({ onBack, onAuthSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUpWithUsername(username, password);
      } else {
        await signInWithUsername(username, password);
      }
      onAuthSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "문제가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = (provider: string) => {
    setComingSoon(`${provider} 연동은 준비 중입니다`);
  };

  return (
    <div className={styles.screen}>
      <button
        type="button"
        className={styles.closeButton}
        aria-label="Close"
        onClick={onBack}
      >
        &#10005;
      </button>

      <h1 className={styles.title}>
        {mode === "signin" ? "로그인" : "회원가입"}
      </h1>

      <div className={styles.modeSwitch}>
        <button
          type="button"
          className={`${styles.modeButton} ${
            mode === "signin" ? styles.modeButtonActive : ""
          }`}
          onClick={() => setMode("signin")}
        >
          Sign In
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${
            mode === "signup" ? styles.modeButtonActive : ""
          }`}
          onClick={() => setMode("signup")}
        >
          Sign Up
        </button>
      </div>

      <div className={styles.providers}>
        <button
          type="button"
          className={styles.providerButton}
          onClick={() => handleProviderClick("GitHub")}
        >
          <GitHubIcon />
          GitHub로 계속하기
        </button>
        <button
          type="button"
          className={styles.providerButton}
          onClick={() => handleProviderClick("Google")}
        >
          <GoogleIcon />
          Google로 계속하기
        </button>
      </div>

      {comingSoon && <p className={styles.comingSoon}>{comingSoon}</p>}

      <div className={styles.divider}>
        <span />
        <span className={styles.dividerLabel}>또는</span>
        <span />
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="text"
          placeholder="사용자 이름"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          className={styles.input}
          type="password"
          placeholder="비밀번호"
          autoComplete={
            mode === "signup" ? "new-password" : "current-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.submitButton} type="submit" disabled={loading}>
          {loading
            ? "처리 중..."
            : mode === "signin"
              ? "로그인"
              : "회원가입"}
        </button>
      </form>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg
      className={styles.providerIcon}
      viewBox="0 0 16 16"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      className={styles.providerIcon}
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
