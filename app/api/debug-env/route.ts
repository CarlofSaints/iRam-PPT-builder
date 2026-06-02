import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const proxyUrl = process.env.IMAGE_PROXY_URL ?? "(not set)";
  const proxyKey = process.env.IMAGE_PROXY_API_KEY ?? "(not set)";

  return NextResponse.json({
    IMAGE_PROXY_URL_length: proxyUrl.length,
    IMAGE_PROXY_URL_prefix: proxyUrl.substring(0, 20),
    IMAGE_PROXY_API_KEY_length: proxyKey.length,
    IMAGE_PROXY_API_KEY_prefix: proxyKey.substring(0, 18),
    BLOB_TOKEN_set: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}
