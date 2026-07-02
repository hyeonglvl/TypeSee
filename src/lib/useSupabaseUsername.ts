"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";

function extractUsername(session: Session | null): string | null {
  const meta = session?.user.user_metadata as { username?: unknown } | undefined;
  return typeof meta?.username === "string" ? meta.username : null;
}

export function useSupabaseUsername(): string | null {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let client;
    try {
      client = getSupabaseClient();
    } catch {
      return;
    }

    client.auth.getSession().then(({ data }) => {
      setUsername(extractUsername(data.session));
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setUsername(extractUsername(session));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return username;
}
