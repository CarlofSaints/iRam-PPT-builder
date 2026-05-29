import { NextRequest, NextResponse } from "next/server";
import { getPerigeeSessionCookie } from "@/lib/perigeeAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/image?url=<perigee-portal-url>
 *
 * Routes through Cloudflare Worker (IMAGE_PROXY_URL) with Perigee session
 * cookie. Reads cookie from blob first, falls back to env var.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) return new NextResponse("Missing url param", { status: 400 });
  if (!url.startsWith("https://live.perigeeportal.co.za")) {
    return new NextResponse("Disallowed domain", { status: 403 });
  }

  try {
    const externalProxy = process.env.IMAGE_PROXY_URL;
    const sessionCookie = await getPerigeeSessionCookie();

    const headers: Record<string, string> = {};
    if (sessionCookie) {
      headers["X-Perigee-Cookie"] = sessionCookie;
    }

    let upstream: Response;

    if (externalProxy) {
      // Route through Cloudflare Worker with session cookie
      const proxyUrl = `${externalProxy}?url=${encodeURIComponent(url)}`;
      upstream = await fetch(proxyUrl, { headers });
    } else {
      // Direct fetch (fallback — likely blocked by Perigee)
      if (sessionCookie) {
        headers["Cookie"] = sessionCookie;
      }
      headers["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
      upstream = await fetch(url, { headers });
    }

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Image proxy error:", err);
    return new NextResponse("Proxy error", { status: 500 });
  }
}
