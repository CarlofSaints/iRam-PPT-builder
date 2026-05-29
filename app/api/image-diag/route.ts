import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/image-diag?url=<perigee-image-url>
 *
 * Diagnostic endpoint — tests each hop in the image proxy chain and reports
 * where it's failing.
 *
 * Without a URL param: just checks env var status + worker reachability.
 * With a URL param: tests full chain end-to-end.
 */
export async function GET(req: NextRequest) {
  const testUrl = req.nextUrl.searchParams.get("url");

  const proxyUrl = process.env.IMAGE_PROXY_URL ?? "";
  const sessionCookie = process.env.PERIGEE_SESSION_COOKIE ?? "";

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      IMAGE_PROXY_URL: proxyUrl ? `set (${proxyUrl.length} chars): ${proxyUrl.substring(0, 50)}...` : "NOT SET",
      PERIGEE_SESSION_COOKIE: sessionCookie
        ? `set (${sessionCookie.length} chars): ${sessionCookie.substring(0, 20)}...${sessionCookie.substring(sessionCookie.length - 10)}`
        : "NOT SET",
    },
  };

  // Step 1: Ping the Cloudflare Worker (no image URL, should return 400 "Missing url param")
  if (proxyUrl) {
    try {
      const pingRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(10_000) });
      report.workerPing = {
        status: pingRes.status,
        statusText: pingRes.statusText,
        body: await pingRes.text().then((t) => t.substring(0, 200)),
        ok: "Worker is reachable",
      };
    } catch (err: unknown) {
      report.workerPing = {
        error: err instanceof Error ? err.message : String(err),
        hint: "Cannot reach Cloudflare Worker — is it deployed?",
      };
    }
  } else {
    report.workerPing = { error: "IMAGE_PROXY_URL not set, skipping worker ping" };
  }

  // Step 2: If a test image URL was provided, try the full chain
  if (testUrl && proxyUrl && sessionCookie) {
    try {
      const fullUrl = `${proxyUrl}?url=${encodeURIComponent(testUrl)}`;
      const headers: Record<string, string> = {
        "X-Perigee-Cookie": sessionCookie,
      };
      const res = await fetch(fullUrl, { headers, signal: AbortSignal.timeout(15_000) });

      const contentType = res.headers.get("content-type") ?? "unknown";
      const contentLength = res.headers.get("content-length") ?? "unknown";

      if (res.ok) {
        const body = await res.arrayBuffer();
        report.fullChain = {
          status: res.status,
          contentType,
          bodySize: body.byteLength,
          ok: `Image fetched successfully (${body.byteLength} bytes)`,
          isImage: contentType.startsWith("image/"),
        };
      } else {
        const text = await res.text();
        report.fullChain = {
          status: res.status,
          statusText: res.statusText,
          contentType,
          contentLength,
          body: text.substring(0, 500),
          hint: res.status === 502
            ? "502 from worker — Perigee rejected the request (expired cookie? wrong cookie format?)"
            : res.status === 403
              ? "403 — domain validation failed"
              : `Unexpected status ${res.status}`,
        };
      }
    } catch (err: unknown) {
      report.fullChain = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else if (testUrl && !sessionCookie) {
    report.fullChain = { error: "PERIGEE_SESSION_COOKIE not set, cannot test full chain" };
  } else if (testUrl && !proxyUrl) {
    report.fullChain = { error: "IMAGE_PROXY_URL not set, cannot test full chain" };
  } else {
    report.fullChain = { skipped: "No test URL provided. Add ?url=<perigee-image-url> to test full chain." };
  }

  // Step 3: Try direct Perigee fetch (for comparison — will likely fail from Vercel IPs)
  if (testUrl) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      };
      if (sessionCookie) headers["Cookie"] = sessionCookie;

      const res = await fetch(testUrl, { headers, signal: AbortSignal.timeout(10_000) });
      report.directFetch = {
        status: res.status,
        contentType: res.headers.get("content-type") ?? "unknown",
        hint: res.ok
          ? "Direct fetch works (unexpected — Perigee allows Vercel IPs)"
          : "Direct fetch blocked (expected — this is why we need the Cloudflare Worker)",
      };
    } catch (err: unknown) {
      report.directFetch = {
        error: err instanceof Error ? err.message : String(err),
        hint: "Direct fetch failed (expected)",
      };
    }
  }

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
