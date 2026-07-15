import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null | undefined;
let anonClient: SupabaseClient | null | undefined;

/** 서버 전용 — 서비스 롤 키로 RLS 를 우회한다. 절대 클라이언트에 노출 금지. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && serviceKey ? createClient(url, serviceKey) : null;
  return adminClient;
}

/** 서버 전용 — 클라이언트가 보낸 access token 으로 로그인 유저를 식별할 때만 쓴다. */
export function getSupabaseAnonForServer(): SupabaseClient | null {
  if (anonClient !== undefined) return anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  anonClient = url && anonKey ? createClient(url, anonKey) : null;
  return anonClient;
}
