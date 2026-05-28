import { parseExcel } from "@/lib/parseExcel";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExcel(buffer);

    return Response.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    console.error("Parse error:", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
