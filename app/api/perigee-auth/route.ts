import { NextRequest, NextResponse } from "next/server";
import {
  getPerigeeSession,
  savePerigeeSession,
} from "@/lib/perigeeAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/perigee-auth — Check current Perigee session status.
 */
export async function GET() {
  const session = await getPerigeeSession();
  const envCookie = process.env.PERIGEE_SESSION_COOKIE;

  return NextResponse.json({
    connected: !!session?.cookie,
    loggedInAt: session?.loggedInAt ?? null,
    loggedInBy: session?.loggedInBy ?? null,
    hasEnvFallback: !!envCookie,
  });
}

/**
 * POST /api/perigee-auth — Log in to Perigee via Cloudflare Worker.
 * Body: { username: string, password: string }
 */
export async function POST(req: NextRequest) {
  const proxyUrl = process.env.IMAGE_PROXY_URL;
  if (!proxyUrl) {
    return NextResponse.json(
      { error: "IMAGE_PROXY_URL not configured" },
      { status: 500 }
    );
  }

  let username: string;
  let password: string;
  try {
    const body = await req.json();
    username = body.username;
    password = body.password;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  try {
    // Forward login to Cloudflare Worker
    const res = await fetch(`${proxyUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error || "Login failed" },
        { status: res.status === 200 ? 401 : res.status }
      );
    }

    // Store the session cookie in blob
    await savePerigeeSession({
      cookie: data.cookie,
      loggedInAt: new Date().toISOString(),
      loggedInBy: username,
    });

    return NextResponse.json({
      ok: true,
      loggedInAt: new Date().toISOString(),
      loggedInBy: username,
    });
  } catch (err) {
    console.error("Perigee login error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to connect to Perigee",
      },
      { status: 502 }
    );
  }
}
