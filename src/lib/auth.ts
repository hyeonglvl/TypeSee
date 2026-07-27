import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

const EMAIL_DOMAIN = "users.typesee.app";

// Same deterministic username→email mapping as v1 (djb2 hash), so accounts
// created in the original app keep working here.
function hashUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function usernameToEmail(username: string) {
  return `user-${hashUsername(username)}@${EMAIL_DOMAIN}`;
}

export function isAuthAvailable(): boolean {
  return getSupabase() !== null;
}

export async function signUpWithUsername(username: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인 기능이 설정되지 않았습니다");
  const { data, error } = await sb.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw error;
  return data;
}

export async function signInWithUsername(username: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인 기능이 설정되지 않았습니다");
  const { data, error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인 기능이 설정되지 않았습니다");
  // Google → Supabase 콜백 → 여기(redirectTo)로 돌아온다. 돌아온 뒤 세션은
  // supabase-js 가 URL 에서 자동으로 집어 onAuthStateChange 로 흘러들어온다.
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithGithub() {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인 기능이 설정되지 않았습니다");
  const { error } = await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export function displayName(user: User): string {
  const meta = user.user_metadata ?? {};
  for (const key of ["username", "user_name", "full_name", "name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return user.email?.split("@")[0] ?? "사용자";
}

export function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return user;
}
