import sharp from "sharp";
import type { ImageData } from "./types";

const PERIGEE_DOMAIN = "live.perigeeportal.co.za";
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 80;
const CONCURRENCY = 5;

/**
 * Download a single image from Perigee, setting required headers.
 * Returns raw buffer or null on failure.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: `https://${PERIGEE_DOMAIN}/`,
      },
    });
    if (!res.ok) {
      console.warn(`Image fetch failed (${res.status}): ${url}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    console.warn("Image download error:", url, err);
    return null;
  }
}

/**
 * Resize / compress an image buffer using sharp.
 * Returns base64 JPEG data ready for pptxgenjs.
 */
async function processImage(buf: Buffer): Promise<ImageData> {
  const processed = await sharp(buf)
    .rotate()                          // Auto-rotate from EXIF
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    data: processed.toString("base64"),
    type: "jpeg",
  };
}

/**
 * Download and process multiple Perigee images with concurrency limit.
 * Returns array in same order as input URLs (null entries for failures).
 */
export async function downloadAllImages(
  urls: string[]
): Promise<(ImageData | null)[]> {
  const results: (ImageData | null)[] = new Array(urls.length).fill(null);

  // Process in batches of CONCURRENCY
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const raw = await downloadImage(url);
        if (!raw) return null;
        return processImage(raw);
      })
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}

/**
 * Proxy a single Perigee image URL — used by the /api/image route.
 * Returns { buffer, contentType } or null.
 */
export async function proxyImage(
  url: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!url.includes(PERIGEE_DOMAIN)) return null;
  const buf = await downloadImage(url);
  if (!buf) return null;
  return { buffer: buf, contentType: "image/jpeg" };
}
