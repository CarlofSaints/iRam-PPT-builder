import { NextResponse } from "next/server";
import type { ParsedData, ImageData } from "@/lib/types";
import { getTemplate } from "@/lib/templateData";
import { downloadAllImages } from "@/lib/perigeeImages";
import { buildPptx } from "@/lib/pptBuilder";

export const maxDuration = 120;

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
    const template = (await getTemplate(templateId || "default")) ??
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

    console.log(`[generate] Found ${allUrls.length} unique image URLs from ${data.rows.filter(r => r.replyStatus.toLowerCase().trim() === "completed").length} completed rows`);
    if (allUrls.length > 0) {
      console.log(`[generate] Sample URL: ${allUrls[0]}`);
    }
    // Also log rows with images vs without
    for (const row of data.rows) {
      if (row.replyStatus.toLowerCase().trim() === "completed") {
        console.log(`[generate] Store: ${row.store} — ${row.images.length} images: ${row.images.join(", ").substring(0, 200)}`);
      }
    }

    // Download and process all images
    const imageResults = await downloadAllImages(allUrls);

    // Build url → ImageData map
    const imageMap = new Map<string, ImageData>();
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < allUrls.length; i++) {
      const img = imageResults[i];
      if (img) {
        imageMap.set(allUrls[i], img);
        successCount++;
      } else {
        failCount++;
        console.warn(`[generate] FAILED to download: ${allUrls[i]}`);
      }
    }
    console.log(`[generate] Images downloaded: ${successCount} success, ${failCount} failed`);

    // Build the PPTX
    const pptxBuffer = await buildPptx(data, template, imageMap);

    // Build filename
    const safeName = data.title
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 60);
    const filename = `${safeName}_Report.pptx`;

    return new NextResponse(pptxBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("Generate error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
