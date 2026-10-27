import { NextRequest, NextResponse } from "next/server";
import { verifySSOToken } from "@/lib/sso";
import { SESSION_COOKIE, createSession, sessionCookieOptions, sessionFromRequest } from "@/lib/pptSession";

const MODULE = "ppt";

/** Exchange a Hub SSO token for this app's signed session cookie (lib/pptSession.ts). */
export async function POST(req: NextRequest) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const secret = process.env.AM_SSO_SECRET || process.env.IRAM_SSO_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SSO not configured" }, { status: 500 });
  }

  const payload = verifySSOToken(token, secret);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired SSO token" },
      { status: 401 },
    );
  }

  // Check module access
  if (!payload.modules.includes(MODULE)) {
    return NextResponse.json(
      { error: "You do not have access to PPT Builder" },
      { status: 403 },
    );
  }

  const cookie = await createSession({ sub: payload.sub, name: payload.name, surname: payload.surname, email: payload.email });
  if (!cookie) return NextResponse.json({ error: "SSO not configured" }, { status: 500 });

  // PPT Builder has no local user store: the profile comes from the token.
  const res = NextResponse.json({
    id: payload.sub,
    name: payload.name,
    surname: payload.surname,
    email: payload.email,
    role: "user",
  });
  res.cookies.set(SESSION_COOKIE, cookie, sessionCookieOptions);
  return res;
}

/** Is the session cookie still good? The pages call this on load (401 = sign in again via the Hub). */
export async function GET(req: NextRequest) {
  const s = await sessionFromRequest(req);
  return s ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

/** Sign out: clear the cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
