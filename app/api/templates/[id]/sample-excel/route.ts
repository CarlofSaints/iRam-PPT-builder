import { extractHeaders } from "@/lib/parseExcel";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/templates/:id/sample-excel — upload sample Excel, return detected headers */
export async function POST(req: Request, { params: _params }: Ctx) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = extractHeaders(buffer);

    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to extract headers";
    return Response.json({ error: message }, { status: 400 });
  }
}
