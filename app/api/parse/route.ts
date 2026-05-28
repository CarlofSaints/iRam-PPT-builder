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

    // Log image extraction for diagnostics
    const completedRows = parsed.rows.filter(r => r.replyStatus.toLowerCase().trim() === "completed");
    const totalImages = completedRows.reduce((s, r) => s + r.images.length, 0);
    console.log(`[parse] ${parsed.rows.length} rows, ${completedRows.length} completed, ${totalImages} images extracted`);
    if (completedRows.length > 0) {
      const first = completedRows[0];
      console.log(`[parse] First completed row images: ${JSON.stringify(first.images)}`);
    }

    return Response.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    console.error("Parse error:", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
