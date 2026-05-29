import { NextRequest, NextResponse } from "next/server";
import { getPerigeeSessionCookie } from "@/lib/perigeeAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/image?url=<perigee-portal-url>
 *
 * Routes through Railway proxy (IMAGE_PROXY_URL) with Perigee session cookie.
 * Reads cookie from blob first, falls back to env var.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) return new NextResponse("Missing url param", { status: 400 });
  if (!url.startsWith("https://live.perigeeportal.co.za")) {
    return new NextResponse("Disallowed domain", { status: 403 });
  }

  try {
    const proxyUrl = process.env.IMAGE_PROXY_URL;
    const proxyKey = process.env.IMAGE_PROXY_API_KEY;
    const sessionCookie = await getPerigeeSessionCookie();

    if (!sessionCookie) {
      return new NextResponse("No Perigee session — log in via Control Centre", {
        status: 401,
      });
    }

    let upstream: Response;

    if (proxyUrl) {
      // Route through Railway proxy
      const fullUrl = `${proxyUrl}/image?url=${encodeURIComponent(url)}`;
      const headers: Record<string, string> = {
        "x-perigee-cookie": sessionCookie,
      };
      if (proxyKey) {
        headers["x-api-key"] = proxyKey;
      }
      upstream = await fetch(fullUrl, { headers });
    } else {
      // Direct fetch (fallback — likely blocked by Perigee)
      upstream = await fetch(url, {
        headers: {
          Cookie: sessionCookie,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
      });
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
