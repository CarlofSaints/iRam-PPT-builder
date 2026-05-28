import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/templateData";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/templates/:id */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(template);
}

/** PUT /api/templates/:id — update a template */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;

  try {
    const body = await req.json();
    const updated = await updateTemplate(id, {
      name: body.name,
      primaryColor: body.primaryColor,
      accentColor: body.accentColor,
      fontFamily: body.fontFamily,
      logoUrl: body.logoUrl,
    });

    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/templates/:id */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ok = await deleteTemplate(id);
  if (!ok) {
    return Response.json(
      { error: "Cannot delete default template or not found" },
      { status: 400 }
    );
  }
  return Response.json({ ok: true });
}
