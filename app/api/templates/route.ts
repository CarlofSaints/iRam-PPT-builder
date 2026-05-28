import { loadTemplates, createTemplate } from "@/lib/templateData";

/** GET /api/templates — list all templates */
export async function GET() {
  const templates = await loadTemplates();
  return Response.json(templates);
}

/** POST /api/templates — create a new template */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, primaryColor, accentColor, fontFamily } = body;

    if (!name?.trim()) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const template = await createTemplate({
      name: name.trim(),
      primaryColor: primaryColor || "003B75",
      accentColor: accentColor || "E04E2A",
      fontFamily: fontFamily || "Arial",
    });

    return Response.json(template, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Create failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
