import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/image?url=<perigee-portal-url>
 *
 * If IMAGE_PROXY_URL env var is set (Cloudflare Worker), forwards through that.
 * Otherwise tries to fetch directly from Perigee (may get 403 from datacenter IPs).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) return new NextResponse("Missing url param", { status: 400 });
  if (!url.startsWith("https://live.perigeeportal.co.za")) {
    return new NextResponse("Disallowed domain", { status: 403 });
  }

  try {
    let upstream: Response;

    const externalProxy = process.env.IMAGE_PROXY_URL;
    if (externalProxy) {
      // Route through Cloudflare Worker (different IP range, not blocked)
      const proxyUrl = `${externalProxy}?url=${encodeURIComponent(url)}`;
      upstream = await fetch(proxyUrl);
      console.log(`[image-proxy] External proxy: ${url.substring(0, 60)}... → ${upstream.status}`);
    } else {
      // Direct fetch (will likely get 403 from Vercel datacenter IPs)
      upstream = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });
      console.log(`[image-proxy] Direct: ${url.substring(0, 60)}... → ${upstream.status}`);
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
