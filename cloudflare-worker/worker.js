/**
 * Cloudflare Worker — Perigee Image Proxy
 *
 * Proxies image requests to live.perigeeportal.co.za with session cookie auth.
 * The calling server passes the Perigee session cookie via X-Perigee-Cookie header.
 *
 * Deploy: Cloudflare Dashboard > Workers & Pages > perigee-proxy > Edit Code > paste > Deploy
 *
 * Usage: GET https://perigee-proxy.carl-dfc.workers.dev/?url=<perigee-image-url>
 *        Header: X-Perigee-Cookie: SSESS...=token...
 */

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const imageUrl = url.searchParams.get("url");

    if (!imageUrl) {
      return new Response("Missing url param", { status: 400 });
    }

    // Only allow Perigee URLs
    if (!imageUrl.startsWith("https://live.perigeeportal.co.za")) {
      return new Response("Disallowed domain", { status: 403 });
    }

    try {
      // Build headers — include session cookie if provided
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };

      // Forward Perigee session cookie if provided
      const cookie = request.headers.get("X-Perigee-Cookie");
      if (cookie) {
        headers["Cookie"] = cookie;
      }

      const upstream = await fetch(imageUrl, { headers });

      if (!upstream.ok) {
        return new Response(`Upstream error: ${upstream.status}`, {
          status: 502,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      const body = await upstream.arrayBuffer();

      return new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
