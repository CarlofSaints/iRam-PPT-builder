"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface Session {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
}

const SESSION_KEY = "ppt_session";

/**
 * Client-side auth guard. Redirects to /login if no session.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      const s: Session = JSON.parse(raw);
      setSession(s);
      // The server-side session (cookie) is what the API trusts. No cookie, or it expired:
      // drop the display copy and go back through the Hub sign-in.
      fetch('/api/sso/callback', { cache: 'no-store' }).then(res => {
        if (res.status === 401) {
          localStorage.removeItem(SESSION_KEY);
          router.replace('/login');
        }
      }).catch(() => { /* offline: keep the display copy */ });
    } catch {
      localStorage.removeItem(SESSION_KEY);
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  async function logout() {
    await fetch('/api/sso/callback', { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem(SESSION_KEY);
    const hubUrl =
      process.env.NEXT_PUBLIC_IRAM_HUB_URL || "https://iram-hub.vercel.app";
    window.location.href = hubUrl;
  }

  return { session, loading, logout };
}

/**
 * Fetch wrapper that attaches x-user-id from the current session.
 */
export function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let userId = "";
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Session>;
        userId = s?.id ?? "";
      }
    } catch {
      /* ignore */
    }
  }

  const headers = new Headers(init.headers);
  if (userId) headers.set("x-user-id", userId);

  return fetch(input, { ...init, headers });
}
