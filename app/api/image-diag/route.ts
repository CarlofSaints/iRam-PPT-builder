import { NextRequest, NextResponse } from "next/server";
import { getPerigeeSession, getPerigeeSessionCookie } from "@/lib/perigeeAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/image-diag?url=<perigee-image-url>
 *
 * Diagnostic endpoint — tests the Railway proxy chain.
 */
export async function GET(req: NextRequest) {
  const testUrl = req.nextUrl.searchParams.get("url");

  const proxyUrl = process.env.IMAGE_PROXY_URL ?? "";
  const proxyKey = process.env.IMAGE_PROXY_API_KEY ?? "";
  const blobSession = await getPerigeeSession();
  const activeCookie = await getPerigeeSessionCookie();

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      IMAGE_PROXY_URL: proxyUrl ? `set (${proxyUrl.length} chars)` : "NOT SET",
      IMAGE_PROXY_API_KEY: proxyKey ? `set (${proxyKey.length} chars)` : "NOT SET",
    },
    blobSession: blobSession
      ? {
          loggedInBy: blobSession.loggedInBy,
          loggedInAt: blobSession.loggedInAt,
          cookieLength: blobSession.cookie.length,
          cookiePreview: `${blobSession.cookie.substring(0, 20)}...`,
        }
      : "NO BLOB SESSION",
    activeCookieSource: blobSession?.cookie ? "blob" : "NONE",
    activeCookieLength: activeCookie?.length ?? 0,
  };

  // Step 1: Ping the Railway proxy
  if (proxyUrl) {
    try {
      const headers: Record<string, string> = {};
      if (proxyKey) headers["x-api-key"] = proxyKey;

      const pingRes = await fetch(`${proxyUrl}/health`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      report.proxyPing = {
        status: pingRes.status,
        body: await pingRes.json().catch(() => "non-JSON"),
        ok: "Proxy is reachable",
      };
    } catch (err: unknown) {
      report.proxyPing = {
        error: err instanceof Error ? err.message : String(err),
        hint: "Cannot reach Railway proxy — is it deployed?",
      };
    }
  }

  // Step 2: Test Perigee access from the proxy
  if (proxyUrl) {
    try {
      const headers: Record<string, string> = {};
      if (proxyKey) headers["x-api-key"] = proxyKey;

      const accessRes = await fetch(`${proxyUrl}/test-access`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      report.perigeeAccess = await accessRes.json().catch(() => ({
        error: "non-JSON response",
      }));
    } catch (err: unknown) {
      report.perigeeAccess = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Step 3: Test full image chain
  if (testUrl && proxyUrl && activeCookie) {
    try {
      const fullUrl = `${proxyUrl}/image?url=${encodeURIComponent(testUrl)}`;
      const headers: Record<string, string> = {
        "x-perigee-cookie": activeCookie,
      };
      if (proxyKey) headers["x-api-key"] = proxyKey;

      const res = await fetch(fullUrl, {
        headers,
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
          hint:
            res.status === 502
              ? "502 — Perigee rejected (expired/wrong cookie)"
              : `Unexpected status ${res.status}`,
        };
      }
    } catch (err: unknown) {
      report.fullChain = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else if (testUrl && !activeCookie) {
    report.fullChain = { error: "No active cookie" };
  } else if (!testUrl) {
    report.fullChain = {
      skipped: "Add ?url=<perigee-image-url> to test full chain.",
    };
  }

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
