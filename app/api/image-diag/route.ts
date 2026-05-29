import { NextRequest, NextResponse } from "next/server";
import { getPerigeeSession, getPerigeeSessionCookie } from "@/lib/perigeeAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/image-diag?url=<perigee-image-url>
 *
 * Diagnostic endpoint — tests each hop in the image proxy chain.
 * Uses the same cookie resolution as the real /api/image route (blob first, env fallback).
 */
export async function GET(req: NextRequest) {
  const testUrl = req.nextUrl.searchParams.get("url");

  const proxyUrl = process.env.IMAGE_PROXY_URL ?? "";
  const envCookie = process.env.PERIGEE_SESSION_COOKIE ?? "";
  const blobSession = await getPerigeeSession();
  const activeCookie = await getPerigeeSessionCookie();

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      IMAGE_PROXY_URL: proxyUrl ? `set (${proxyUrl.length} chars)` : "NOT SET",
      PERIGEE_SESSION_COOKIE_ENV: envCookie
        ? `set (${envCookie.length} chars): ${envCookie.substring(0, 20)}...`
        : "NOT SET",
    },
    blobSession: blobSession
      ? {
          loggedInBy: blobSession.loggedInBy,
          loggedInAt: blobSession.loggedInAt,
          cookieLength: blobSession.cookie.length,
          cookiePreview: `${blobSession.cookie.substring(0, 20)}...`,
        }
      : "NO BLOB SESSION",
    activeCookieSource: blobSession?.cookie ? "blob" : envCookie ? "env" : "NONE",
    activeCookieLength: activeCookie?.length ?? 0,
  };

  // Step 1: Ping the Cloudflare Worker
  if (proxyUrl) {
    try {
      const pingRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(10_000) });
      report.workerPing = {
        status: pingRes.status,
        body: await pingRes.text().then((t) => t.substring(0, 200)),
        ok: "Worker is reachable",
      };
    } catch (err: unknown) {
      report.workerPing = {
        error: err instanceof Error ? err.message : String(err),
        hint: "Cannot reach Cloudflare Worker — is it deployed?",
      };
    }
  }

  // Step 2: Test full chain with the ACTIVE cookie (same one /api/image uses)
  if (testUrl && proxyUrl && activeCookie) {
    try {
      const fullUrl = `${proxyUrl}?url=${encodeURIComponent(testUrl)}`;
      const res = await fetch(fullUrl, {
        headers: { "X-Perigee-Cookie": activeCookie },
        signal: AbortSignal.timeout(15_000),
      });

      const contentType = res.headers.get("content-type") ?? "unknown";

      if (res.ok) {
        const body = await res.arrayBuffer();
        report.fullChain = {
          status: res.status,
          contentType,
          bodySize: body.byteLength,
          ok: `Image fetched successfully (${body.byteLength} bytes)`,
        };
      } else {
        const text = await res.text();
        report.fullChain = {
          status: res.status,
          body: text.substring(0, 500),
          hint: res.status === 502
            ? "502 — Perigee rejected the request (expired/wrong cookie)"
            : `Unexpected status ${res.status}`,
        };
      }
    } catch (err: unknown) {
      report.fullChain = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else if (testUrl && !activeCookie) {
    report.fullChain = { error: "No active cookie (neither blob nor env var)" };
  } else if (!testUrl) {
    report.fullChain = { skipped: "Add ?url=<perigee-image-url> to test full chain." };
  }

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
