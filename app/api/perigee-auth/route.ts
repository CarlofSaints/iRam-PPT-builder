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
 * POST /api/perigee-auth — Save Perigee session cookie.
 *
 * Accepts either:
 *   { cookie: "SSESS...=value" }           — manual cookie paste
 *   { username: string, password: string }  — automated login via Cloudflare Worker
 */
export async function POST(req: NextRequest) {
  let body: { cookie?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // ── Manual cookie paste ──────────────────────────────
  if (body.cookie) {
    const cookie = body.cookie.trim();
    if (!cookie.startsWith("SSESS")) {
      return NextResponse.json(
        { error: "Cookie must start with SSESS. Copy the full cookie name=value from your browser." },
        { status: 400 }
      );
    }
    if (!cookie.includes("=")) {
      return NextResponse.json(
        { error: "Cookie must be in name=value format (e.g. SSESS12ca...=abc123...)" },
        { status: 400 }
      );
    }

    await savePerigeeSession({
      cookie,
      loggedInAt: new Date().toISOString(),
      loggedInBy: "manual paste",
    });

    return NextResponse.json({
      ok: true,
      loggedInAt: new Date().toISOString(),
      loggedInBy: "manual paste",
    });
  }

  // ── Automated login via Cloudflare Worker ────────────
  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: "Provide either { cookie } or { username, password }" },
      { status: 400 }
    );
  }

  const proxyUrl = process.env.IMAGE_PROXY_URL;
  if (!proxyUrl) {
    return NextResponse.json(
      { error: "IMAGE_PROXY_URL not configured" },
      { status: 500 }
    );
  }

  try {
    // First try the normal login endpoint
    const res = await fetch(`${proxyUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json();

    if (data.ok && data.cookie) {
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
    }

    // Login failed — try debug endpoint for diagnostics
    let debugInfo = null;
    try {
      const debugRes = await fetch(`${proxyUrl}/login-debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(20_000),
      });
      const debugData = await debugRes.json();
      debugInfo = debugData.diag || null;

      // If debug endpoint actually succeeded where normal didn't, save it
      if (debugData.ok && debugData.cookie) {
        await savePerigeeSession({
          cookie: debugData.cookie,
          loggedInAt: new Date().toISOString(),
          loggedInBy: username,
        });
        return NextResponse.json({
          ok: true,
          loggedInAt: new Date().toISOString(),
          loggedInBy: username,
        });
      }
    } catch {
      // debug endpoint failed too, that's fine
    }

    return NextResponse.json(
      { error: data.error || "Login failed", debug: debugInfo },
      { status: res.status === 200 ? 401 : res.status }
    );
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
