import { writeBinary } from "@/lib/blob";
import { updateTemplate, getTemplate } from "@/lib/templateData";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/templates/:id/logo — upload a logo image */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  const template = await getTemplate(id);
  if (!template) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("logo") as File | null;

    if (!file) {
      return Response.json({ error: "No logo file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/png";
    const ext = contentType.includes("png") ? "png" : "jpg";

    const blobKey = `logos/${id}.${ext}`;
    const logoUrl = await writeBinary(blobKey, buffer, contentType);

    const updated = await updateTemplate(id, { logoUrl });
    return Response.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
