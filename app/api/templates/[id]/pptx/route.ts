import { getTemplate, updateTemplate } from "@/lib/templateData";
import { writeBinary, deleteJson } from "@/lib/blob";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/templates/:id/pptx — upload a .pptx template file */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  try {
    const template = await getTemplate(id);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("pptx") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pptx")) {
      return Response.json(
        { error: "Only .pptx files are accepted" },
        { status: 400 }
      );
    }

    // Store in blob
    const buffer = Buffer.from(await file.arrayBuffer());
    const blobKey = `pptx-templates/${id}.pptx`;
    const url = await writeBinary(
      blobKey,
      buffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    // Update template record
    const updated = await updateTemplate(id, { pptxTemplateUrl: url });

    return Response.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/templates/:id/pptx — remove uploaded .pptx template */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;

  try {
    const template = await getTemplate(id);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Remove from blob
    await deleteJson(`pptx-templates/${id}.pptx`).catch(() => {});

    // Clear URL on template record
    const updated = await updateTemplate(id, { pptxTemplateUrl: null });

    return Response.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
