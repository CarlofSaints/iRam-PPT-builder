import { NextResponse } from "next/server";
import type { ParsedData, ImageData } from "@/lib/types";
import { getTemplate } from "@/lib/templateData";
import { buildPptx } from "@/lib/pptBuilder";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { data, templateId, images } = body as {
      data: ParsedData;
      templateId?: string;
      images?: Record<string, string>; // url → base64 (pre-downloaded by client)
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

    // Build url → ImageData map from client-provided base64 images
    const imageMap = new Map<string, ImageData>();
    let successCount = 0;
    if (images) {
      for (const [url, base64] of Object.entries(images)) {
        if (base64) {
          imageMap.set(url, { data: base64, type: "jpeg" });
          successCount++;
        }
      }
    }
    console.log(`[generate] Received ${successCount} pre-downloaded images from client`);

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
