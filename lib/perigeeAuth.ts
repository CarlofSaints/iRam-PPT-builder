import { readJson, writeJson } from "./blob";

export interface PerigeeSession {
  cookie: string; // Full "SSESS...=value" string
  loggedInAt: string; // ISO timestamp
  loggedInBy: string; // Perigee username
}

const BLOB_KEY = "config/perigee-session.json";

/** Read the stored Perigee session from blob. */
export async function getPerigeeSession(): Promise<PerigeeSession | null> {
  return readJson<PerigeeSession | null>(BLOB_KEY, null);
}

/** Save a new Perigee session to blob. */
export async function savePerigeeSession(
  session: PerigeeSession
): Promise<void> {
  await writeJson(BLOB_KEY, session);
}

/**
 * Get the Perigee session cookie string.
 * Reads from blob first, falls back to PERIGEE_SESSION_COOKIE env var.
 */
export async function getPerigeeSessionCookie(): Promise<string | null> {
  const session = await getPerigeeSession();
  if (session?.cookie) return session.cookie;
  return process.env.PERIGEE_SESSION_COOKIE || null;
}
