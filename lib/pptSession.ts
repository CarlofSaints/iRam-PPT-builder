/**
 * Server-checked session. The Hub's SSO token used to be checked once and then thrown
 * away, with the profile only in localStorage, so no API route knew who was calling.
 * Now /api/sso/callback sets this signed, httpOnly cookie and proxy.ts requires it on
 * every API route.
 *
 * Signed with a key derived from the module's existing Hub SSO secret, so no new env
 * value is needed. Web Crypto, so the same code runs in proxy.ts and route handlers.
 */
export const SESSION_COOKIE = "ppt_auth";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours, then back through the Hub

export interface PptSession { sub: string; name: string; surname: string; email: string; exp: number }

function hubSecret(): string | null {
  return process.env.AM_SSO_SECRET || process.env.IRAM_SSO_SECRET || null;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  arr.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

async function sign(data: string, secret: string): Promise<string> {
  // A separate key from the SSO token's: "ppt-session" is mixed in.
  const key = await crypto.subtle.importKey("raw", enc.encode(`ppt-session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSession(p: Omit<PptSession, "exp">): Promise<string | null> {
  const secret = hubSecret();
  if (!secret) return null;
  const body = b64url(enc.encode(JSON.stringify({ ...p, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  return `${body}.${await sign(body, secret)}`;
}

export async function readSession(raw: string | undefined): Promise<PptSession | null> {
  const secret = hubSecret();
  if (!secret || !raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = await sign(body, secret);
  // Constant-time compare.
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const p = JSON.parse(fromB64url(body)) as PptSession;
    return typeof p.sub === "string" && p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

/** The session from a plain Request's cookie header. */
export async function sessionFromRequest(req: Request): Promise<PptSession | null> {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return readSession(decodeURIComponent(part.slice(i + 1).trim()));
  }
  return null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
