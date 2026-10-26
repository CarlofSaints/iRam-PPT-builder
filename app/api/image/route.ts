import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/image?url=<perigee-portal-url>
 *
 * Perigee URLs route through the Railway proxy (IMAGE_PROXY_URL), which only
 * accepts Perigee. Field Goose URLs are public and fetched direct.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) return new NextResponse("Missing url param", { status: 400 });
  const isPerigee = url.startsWith("https://live.perigeeportal.co.za/");
  if (!isPerigee && !/^https?:\/\/www\.fieldgoose\.com\//.test(url)) {
    return new NextResponse("Disallowed domain", { status: 403 });
  }

  try {
    const proxyUrl = process.env.IMAGE_PROXY_URL;
    const proxyKey = process.env.IMAGE_PROXY_API_KEY;

    let upstream: Response;

    if (proxyUrl && isPerigee) {
      // Route through Railway proxy
      const fullUrl = `${proxyUrl}/image?url=${encodeURIComponent(url)}`;
      const headers: Record<string, string> = {};
      if (proxyKey) headers["x-api-key"] = proxyKey;
      upstream = await fetch(fullUrl, { headers });
    } else {
      // Direct fetch (fallback)
      upstream = await fetch(url, {
        headers: {
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
    // Streamed, not buffered: Vercel refuses a buffered body over 4.5 MB.
    return new NextResponse(upstream.body, {
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
