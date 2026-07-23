import { parseExcel } from "@/lib/parseExcel";
import { getTemplate } from "@/lib/templateData";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const templateId = formData.get("templateId") as string | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Load column mapping from template (if specified)
    let mapping = null;
    if (templateId) {
      const template = await getTemplate(templateId);
      if (template?.columnMapping) {
        mapping = template.columnMapping;
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExcel(buffer, mapping);

    // Log extraction for diagnostics
    const d = parsed.deckSummary;
    console.log(
      `[parse] mode=${parsed.mode} ${parsed.rows.length} rows → ${d.totalVisits} visits, ` +
      `${d.uniqueSites} sites, ${d.totalPictures} images, ` +
      `${d.uniqueQuestions} questions (${d.totalAnswers} answers)`
    );

    return Response.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    console.error("Parse error:", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
