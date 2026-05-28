import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug-proxy
 * Tests whether IMAGE_PROXY_URL is set and whether the worker responds.
 * DELETE THIS FILE once images are working.
 */
export async function GET() {
  const proxyUrl = process.env.IMAGE_PROXY_URL;

  const result: Record<string, unknown> = {
    IMAGE_PROXY_URL_set: !!proxyUrl,
    IMAGE_PROXY_URL_length: proxyUrl?.length ?? 0,
    IMAGE_PROXY_URL_value: proxyUrl
      ? proxyUrl.substring(0, 50) + (proxyUrl.length > 50 ? "..." : "")
      : null,
  };

  // Try hitting the worker with a small test
  if (proxyUrl) {
    try {
      const testUrl =
        "https://live.perigeeportal.co.za/admin/config/perigee/visits/get_image/perigee-1154FJ5S2-243560-1.jpg";
      const workerUrl = `${proxyUrl}?url=${encodeURIComponent(testUrl)}`;
      result.workerTestUrl = workerUrl;

      const res = await fetch(workerUrl);
      result.workerStatus = res.status;
      result.workerStatusText = res.statusText;
      result.workerContentType = res.headers.get("content-type");
      result.workerContentLength = res.headers.get("content-length");

      if (!res.ok) {
        const text = await res.text();
        result.workerErrorBody = text.substring(0, 500);
      } else {
        const buf = await res.arrayBuffer();
        result.workerResponseBytes = buf.byteLength;
      }
    } catch (err: unknown) {
      result.workerError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
