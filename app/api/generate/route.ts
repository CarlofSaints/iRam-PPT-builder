import { NextResponse } from "next/server";
import sharp from "sharp";
import type { ParsedData, ImageData } from "@/lib/types";
import { getTemplate } from "@/lib/templateData";
import { buildPptx } from "@/lib/pptBuilder";
import { fetchAllowed, isPhotoUrl } from "@/lib/urlGuard";

export const maxDuration = 300;

/** How many images to fetch at once. */
const DOWNLOAD_CONCURRENCY = 12;

/**
 * Perigee serves full-size phone photos (~1.3 MB each). Embedded untouched, a
 * 200-photo deck lands at ~260 MB, which is slow to build, slow to download and
 * painful to open. Downscaling to slide resolution cuts that by ~10x with no
 * visible loss at the sizes we lay out.
 */
async function compressImage(buffer: ArrayBuffer): Promise<Buffer | null> {
  const input = Buffer.from(buffer);
  try {
    return await sharp(input)
      .rotate()                                // honour EXIF orientation
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;                               // not a decodable image: embed nothing (raw bytes could be any response)
  }
}

/**
 * Download a single image. Old Perigee URLs go via the Railway proxy (it only
 * accepts live.perigeeportal.co.za); Field Goose URLs are public, fetch direct.
 * Returns base64 string or null on failure.
 */
async function downloadImage(url: string): Promise<string | null> {
  const proxyUrl = process.env.IMAGE_PROXY_URL;
  const proxyKey = process.env.IMAGE_PROXY_API_KEY;

  // Only Field Goose / Perigee photo links: the URL comes from the request body.
  if (!isPhotoUrl(url)) return null;
  try {
    let buffer: ArrayBuffer;

    if (proxyUrl && url.startsWith("https://live.perigeeportal.co.za")) {
      const fullUrl = `${proxyUrl}/image?url=${encodeURIComponent(url)}`;
      const headers: Record<string, string> = {};
      if (proxyKey) headers["x-api-key"] = proxyKey;
      const upstream = await fetch(fullUrl, { headers });
      if (!upstream.ok) {
        console.warn(`[generate] Image fetch failed (${upstream.status}): ${url.substring(0, 80)}`);
        return null;
      }
      buffer = await upstream.arrayBuffer();
    } else {
      const got = await fetchAllowed(url, isPhotoUrl, 25 * 1024 * 1024, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (!got) {
        console.warn(`[generate] Image fetch failed: ${url.substring(0, 80)}`);
        return null;
      }
      buffer = got.buf;
    }

    const compressed = await compressImage(buffer);
    return compressed ? compressed.toString("base64") : null;
  } catch (err) {
    console.warn(`[generate] Image fetch error: ${url.substring(0, 80)}`, err);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { data, templateId } = body as {
      data: ParsedData;
      templateId?: string;
    };

    if (!data || !data.rows) {
      return Response.json({ error: "Missing parsed data" }, { status: 400 });
    }

    // Load template (fallback to default)
    const template =
      (await getTemplate(templateId || "default")) ??
      (await getTemplate("default"))!;

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Collect all unique image URLs.
    // Skip a row only when it has an EXPLICIT status that isn't "completed"
    // (task-report exports). Form/relay exports have no status column, so their
    // rows have an empty status and must still contribute their images — this
    // must mirror the store-slide filter in lib/pptBuilder.ts, otherwise we
    // download nothing and the deck comes out empty.
    const allUrls: string[] = [];
    for (const row of data.rows) {
      const status = row.replyStatus.toLowerCase().trim();
      if (status && status !== "completed") continue;
      for (const url of row.images) {
        if (url && !allUrls.includes(url)) allUrls.push(url);
      }
    }

    // Download images server-side. A worker pool keeps all lanes busy for the
    // whole run — fixed batches stalled on the slowest image in each batch,
    // which is what pushed 199-photo exports past the function timeout.
    console.log(`[generate] Downloading ${allUrls.length} images server-side...`);
    const imageMap = new Map<string, ImageData>();
    let downloaded = 0;
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= allUrls.length) return;
        const url = allUrls[i];
        const base64 = await downloadImage(url);
        if (base64) {
          imageMap.set(url, { data: base64, type: "jpeg" });
          downloaded++;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, allUrls.length) }, worker)
    );
    console.log(`[generate] Downloaded ${downloaded}/${allUrls.length} images`);

    // Build the PPTX
    const pptxBuffer = await buildPptx(data, template, imageMap);

    // Build filename from template's outputNaming pattern (or default)
    const pattern = template.outputNaming || "{title}_Report";
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const firstChannel = data.rows[0]?.channel || "";
    const resolvedName = pattern
      .replace(/\{title\}/gi, data.title)
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{channel\}/gi, firstChannel);
    const safeName = resolvedName
      .replace(/[^a-zA-Z0-9\s_-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 80);
    const filename = `${safeName || "Report"}.pptx`;

    return new NextResponse(pptxBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Images-Downloaded": `${downloaded}/${allUrls.length}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("Generate error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
