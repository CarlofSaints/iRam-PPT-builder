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

  return NextResponse.json({
    connected: !!session?.cookie,
    loggedInAt: session?.loggedInAt ?? null,
    loggedInBy: session?.loggedInBy ?? null,
  });
}

/**
 * POST /api/perigee-auth — Authenticate with Perigee.
 *
 * Accepts either:
 *   { cookie: "SSESS...=value" }           — manual cookie paste
 *   { username: string, password: string }  — automated login via Railway proxy
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
        {
          error:
            "Cookie must start with SSESS. Copy the full cookie name=value from your browser.",
        },
        { status: 400 }
      );
    }
    if (!cookie.includes("=")) {
      return NextResponse.json(
        {
          error:
            "Cookie must be in name=value format (e.g. SSESS12ca...=abc123...)",
        },
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

  // ── Automated login via Railway proxy ────────────────
  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: "Provide either { cookie } or { username, password }" },
      { status: 400 }
    );
  }

  const proxyUrl = process.env.IMAGE_PROXY_URL;
  const proxyKey = process.env.IMAGE_PROXY_API_KEY;
  if (!proxyUrl) {
    return NextResponse.json(
      { error: "IMAGE_PROXY_URL not configured" },
      { status: 500 }
    );
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (proxyKey) {
      headers["x-api-key"] = proxyKey;
    }

    const res = await fetch(`${proxyUrl}/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ username, password, debug: true }),
      signal: AbortSignal.timeout(25_000),
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

    return NextResponse.json(
      { error: data.error || "Login failed", debug: data.debug || null },
      { status: 401 }
    );
  } catch (err) {
    console.error("Perigee login error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to connect to proxy",
      },
      { status: 502 }
    );
  }
}
