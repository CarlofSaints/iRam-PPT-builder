import { NextResponse } from "next/server";
import type { ParsedData, ImageData } from "@/lib/types";
import { getTemplate } from "@/lib/templateData";
import { buildPptx } from "@/lib/pptBuilder";

export const maxDuration = 120;

/**
 * Download a single image from Perigee via Railway proxy.
 * Returns base64 string or null on failure.
 */
async function downloadImage(url: string): Promise<string | null> {
  const proxyUrl = process.env.IMAGE_PROXY_URL;
  const proxyKey = process.env.IMAGE_PROXY_API_KEY;

  try {
    let upstream: Response;

    if (proxyUrl) {
      const fullUrl = `${proxyUrl}/image?url=${encodeURIComponent(url)}`;
      const headers: Record<string, string> = {};
      if (proxyKey) headers["x-api-key"] = proxyKey;
      upstream = await fetch(fullUrl, { headers });
    } else {
      upstream = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
    }

    if (!upstream.ok) {
      console.warn(`[generate] Image fetch failed (${upstream.status}): ${url.substring(0, 80)}`);
      return null;
    }

    const buffer = await upstream.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
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

    // Collect all unique image URLs from completed rows
    const allUrls: string[] = [];
    for (const row of data.rows) {
      if (row.replyStatus.toLowerCase().trim() !== "completed") continue;
      for (const url of row.images) {
        if (url && !allUrls.includes(url)) allUrls.push(url);
      }
    }

    // Download images server-side in batches of 5
    console.log(`[generate] Downloading ${allUrls.length} images server-side...`);
    const imageMap = new Map<string, ImageData>();
    let downloaded = 0;

    for (let i = 0; i < allUrls.length; i += 5) {
      const batch = allUrls.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (url) => {
          const base64 = await downloadImage(url);
          return base64 ? { url, base64 } : null;
        })
      );
      for (const result of results) {
        if (result) {
          imageMap.set(result.url, { data: result.base64, type: "jpeg" });
          downloaded++;
        }
      }
    }
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
