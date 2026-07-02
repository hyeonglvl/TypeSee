import { getSupabaseClient } from "./supabaseClient";

const EMAIL_DOMAIN = "users.typesee.app";

// Supabase requires a valid ASCII email format, but usernames may contain
// Korean characters, spaces, or symbols. Hash the normalized username into
// an ASCII-safe local-part instead of using it directly, so any username is
// always accepted and the mapping stays deterministic (same username ->
// same email) for sign-in.
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

export async function signUpWithUsername(username: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw error;
  return data;
}

export async function signInWithUsername(username: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
