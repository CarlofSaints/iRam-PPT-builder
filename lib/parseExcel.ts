import * as XLSX from "xlsx";
import { groupVisits } from "./visits";
import type {
  TaskRow,
  ParsedData,
  StatusSummary,
  ColumnMapping,
  QAPair,
  QuestionStat,
  DeckSummary,
  ExportMode,
} from "./types";

/**
 * Column mappings — maps canonical field names to possible Excel header variants.
 * Case-insensitive matching. First match wins.
 * Used only when no explicit ColumnMapping is provided.
 */
const COLUMN_MAP: Record<string, string[]> = {
  title:          ["title", "task title"],
  notes:          ["notes", "task notes", "description"],
  channel:        ["channel", "channel name"],
  store:          ["store", "store name", "outlet"],
  storeCode:      ["store code", "store id", "site code", "outlet code"],
  storeFullName:  ["store full name", "full name", "full store name"],
  createdBy:      ["created by", "creator", "assigned by"],
  replyStatus:    ["reply status", "status", "task status"],
  replyBy:        ["reply by", "replied by", "completed by"],
  replyNotes:     ["reply notes", "reply comment", "reply comments"],
  replyResponse:  ["reply response", "response"],
  visitId:        ["id", "visit id", "task id", "visit uuid"],
  date:           ["date", "visit date", "date of visit", "created date", "reply date"],
  image1:         ["image 1", "image1", "photo 1", "photo1"],
  image2:         ["image 2", "image2", "photo 2", "photo2"],
  image3:         ["image 3", "image3", "photo 3", "photo3"],
  image4:         ["image 4", "image4", "photo 4", "photo4"],
  image5:         ["image 5", "image5", "photo 5", "photo5"],
};

/** Non-image, non-question metadata columns present in every Perigee export. */
const META_HEADERS = new Set([
  "id", "email", "first name", "last name", "customer", "channel", "store",
  "store code", "store name", "store id", "site code", "outlet", "outlet code",
  "store full name", "full name", "full store name", "province", "region",
  "date", "visit date", "date of visit", "created date", "reply date", "time",
  "visit uuid", "visit id", "task id", "tag", "sync date", "sync time", "day",
  "title", "task title", "notes", "task notes", "description", "created by",
  "creator", "assigned by", "status", "task status", "reply status",
  "reply by", "replied by", "completed by", "reply notes", "reply comment",
  "reply comments", "reply response", "response", "user", "rep", "latitude",
  "longitude",
]);

/** Values that always mean a column is a choice question, however few rows. */
const BOOLEAN_VALUES = new Set([
  "yes", "no", "y", "n", "true", "false", "n/a", "na", "not applicable",
]);

/** Normalise a header cell value for matching */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

/** Format a Perigee date cell (serial number, Date, or string) as "23 Jul 2026". */
function formatDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  if (raw instanceof Date) return isNaN(raw.getTime()) ? "" : fmt(raw);

  // Excel serial number — Perigee exports dates unformatted, so XLSX hands
  // them back as raw numbers rather than Dates.
  const asNumber = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!isNaN(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const parts = XLSX.SSF.parse_date_code(asNumber);
    if (parts) return fmt(new Date(parts.y, parts.m - 1, parts.d));
  }

  const str = String(raw).trim();
  // Perigee also emits DD/MM/YYYY — parse day-first, never as US MM/DD/YYYY.
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!isNaN(d.getTime())) return fmt(d);
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return fmt(parsed);

  return str;
}

/**
 * Detect the raw data grid from a workbook buffer.
 * Returns { raw, wb } for use by both parseExcel and extractHeaders.
 */
function readSheet(buffer: Buffer): { raw: string[][]; wb: XLSX.WorkBook } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in workbook");

  const sheet = wb.Sheets[sheetName];
  const raw: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  return { raw, wb };
}

/**
 * Extract headers from an Excel buffer.
 * Returns the detected header row and its index.
 * Used by the sample-excel endpoint.
 */
export function extractHeaders(buffer: Buffer): {
  headers: string[];
  headerRow: number;
} {
  const { raw } = readSheet(buffer);
  if (raw.length < 1) throw new Error("File is empty");

  const allFieldNames = Object.values(COLUMN_MAP).flat();
  let headerRowIdx = 0;
  let bestMatchCount = 0;

  for (let r = 0; r < Math.min(10, raw.length); r++) {
    const row = raw[r];
    let matchCount = 0;
    for (const cell of row) {
      const n = norm(String(cell));
      if (allFieldNames.some((f) => n === f)) matchCount++;
    }
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      headerRowIdx = r;
    }
  }

  // If auto-detect found nothing, just use row 0
  if (bestMatchCount === 0) headerRowIdx = 0;

  const headers = raw[headerRowIdx]
    .map((c) => String(c).trim())
    .filter((h) => h !== "");

  return { headers, headerRow: headerRowIdx };
}

/** Every ColumnMapping key except imageColumns. */
const MAPPABLE_FIELDS: (keyof Omit<ColumnMapping, "imageColumns">)[] = [
  "title", "notes", "channel", "store", "storeCode",
  "storeFullName", "createdBy", "replyStatus", "replyBy",
  "replyNotes", "replyResponse", "visitId", "date",
];

/**
 * Build colMap from an explicit ColumnMapping (non-image fields).
 * Matches mapping values to header row by normalised comparison.
 */
function buildColMapFromMapping(
  mapping: ColumnMapping,
  headerRow: string[]
): Record<string, number> {
  const colMap: Record<string, number> = {};

  for (const field of MAPPABLE_FIELDS) {
    const mappedHeader = mapping[field];
    if (!mappedHeader) continue;
    const normalised = norm(mappedHeader);
    for (let c = 0; c < headerRow.length; c++) {
      if (norm(String(headerRow[c])) === normalised) {
        colMap[field] = c;
        break;
      }
    }
  }
  return colMap;
}

/**
 * Build image column indices from an explicit ColumnMapping.
 */
function buildImageColIndices(
  mapping: ColumnMapping,
  headerRow: string[]
): number[] {
  if (!mapping.imageColumns?.length) return [];
  const indices: number[] = [];
  for (const colName of mapping.imageColumns) {
    const normalised = norm(colName);
    for (let c = 0; c < headerRow.length; c++) {
      if (norm(String(headerRow[c])) === normalised) {
        indices.push(c);
        break;
      }
    }
  }
  return indices;
}

/** True when a value reads as a number (barcode, quantity, rand value). */
function isNumericish(v: string): boolean {
  return /^-?[\d\s.,]+$/.test(v) && /\d/.test(v);
}

/**
 * Classify one question column and count its responses.
 *
 * A column is a "choice" question when its answers repeat across a small set of
 * short values — Yes/No toggles and dropdown pickers. Free text (every answer
 * different) and numeric columns (barcodes, quantities, rand values) are
 * counted as answered but produce no breakdown.
 */
function analyseQuestion(question: string, values: string[]): QuestionStat {
  const answered = values.length;
  if (answered === 0) {
    return { question, kind: "text", answered: 0, options: [] };
  }

  const numericShare = values.filter(isNumericish).length / answered;
  if (numericShare > 0.8) {
    return { question, kind: "numeric", answered, options: [] };
  }

  // Group case-insensitively, but display the most common original spelling.
  const groups = new Map<string, Map<string, number>>();
  for (const v of values) {
    const key = v.toLowerCase();
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(v, (spellings.get(v) ?? 0) + 1);
    groups.set(key, spellings);
  }

  const distinct = groups.size;
  const maxLen = values.reduce((m, v) => Math.max(m, v.length), 0);
  const allBoolean = [...groups.keys()].every((k) => BOOLEAN_VALUES.has(k));

  // Repetition is what separates a dropdown from free text: a choice column has
  // few distinct values relative to how many times it was answered.
  const isChoice =
    allBoolean ||
    (answered >= 5 && distinct <= 20 && distinct * 3 <= answered && maxLen <= 60);

  if (!isChoice) {
    return { question, kind: "text", answered, options: [] };
  }

  const options = [...groups.entries()]
    .map(([, spellings]) => {
      let label = "";
      let best = 0;
      let count = 0;
      for (const [spelling, n] of spellings) {
        count += n;
        if (n > best) {
          best = n;
          label = spelling;
        }
      }
      return { label, count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { question, kind: "choice", answered, options };
}

/**
 * Parse an uploaded Excel buffer into structured ParsedData.
 * If a ColumnMapping is provided, use explicit column names instead of auto-detect aliases.
 * If no mapping, auto-detects header row (first row where >= 3 known columns match).
 */
export function parseExcel(buffer: Buffer, mapping?: ColumnMapping | null): ParsedData {
  const { raw } = readSheet(buffer);

  if (raw.length < 2) throw new Error("File has fewer than 2 rows");

  let headerRowIdx: number;
  let colMap: Record<string, number>;
  let imageColIndices: number[] | null = null; // null = use image1-5 keys

  if (mapping && Object.keys(mapping).some((k) => k !== "imageColumns" ? mapping[k as keyof ColumnMapping] : (mapping.imageColumns?.length ?? 0) > 0)) {
    // ── Explicit mapping mode ──
    // Collect all mapped header names to find the header row
    const mappedNames: string[] = [];
    for (const f of MAPPABLE_FIELDS) {
      if (mapping[f]) mappedNames.push(norm(mapping[f]!));
    }
    if (mapping.imageColumns) {
      for (const ic of mapping.imageColumns) mappedNames.push(norm(ic));
    }

    // Find header row by matching mapped names
    headerRowIdx = 0;
    let bestMatch = 0;
    for (let r = 0; r < Math.min(10, raw.length); r++) {
      let matchCount = 0;
      for (const cell of raw[r]) {
        if (mappedNames.includes(norm(String(cell)))) matchCount++;
      }
      if (matchCount > bestMatch) {
        bestMatch = matchCount;
        headerRowIdx = r;
      }
    }

    colMap = buildColMapFromMapping(mapping, raw[headerRowIdx]);
    imageColIndices = buildImageColIndices(mapping, raw[headerRowIdx]);
  } else {
    // ── Auto-detect mode (original behaviour) ──
    headerRowIdx = 0;
    let bestMatchCount = 0;
    const allFieldNames = Object.values(COLUMN_MAP).flat();

    for (let r = 0; r < Math.min(10, raw.length); r++) {
      const row = raw[r];
      let matchCount = 0;
      for (const cell of row) {
        const n = norm(String(cell));
        if (allFieldNames.some((f) => n === f)) matchCount++;
      }
      if (matchCount > bestMatchCount) {
        bestMatchCount = matchCount;
        headerRowIdx = r;
      }
    }

    if (bestMatchCount < 3) {
      throw new Error(
        `Could not detect header row — only ${bestMatchCount} known columns found. Expected columns like: Title, Store, Reply Status, Image 1, etc.`
      );
    }

    // Build column index map from aliases
    const headerRow = raw[headerRowIdx];
    colMap = {};
    for (const [fieldKey, aliases] of Object.entries(COLUMN_MAP)) {
      for (let c = 0; c < headerRow.length; c++) {
        const n = norm(String(headerRow[c]));
        if (aliases.includes(n)) {
          colMap[fieldKey] = c;
          break;
        }
      }
    }

    // Auto-detect image columns. Perigee form/relay exports store photos in
    // columns like "Before Photos", "After Photos" and "Pictures of
    // merchandising" (often duplicated), not just "Image 1-5". A column counts
    // as an image column if EITHER its header mentions a photo/picture/image
    // keyword OR its data cells contain http(s) URLs — Perigee images are
    // always URLs, so URL detection catches oddly-named columns too. We scan by
    // column index so duplicate header names are all captured.
    const colCount = Math.max(...raw.map((r) => r.length), headerRow.length);
    const sampleEnd = Math.min(raw.length, headerRowIdx + 1 + 50); // sample up to 50 data rows
    const imgCols = new Set<number>();
    for (let c = 0; c < colCount; c++) {
      const n = norm(String(headerRow[c] ?? ""));
      if (n.includes("photo") || n.includes("picture") || n.includes("image")) {
        imgCols.add(c);
        continue;
      }
      for (let r = headerRowIdx + 1; r < sampleEnd; r++) {
        const cell = String(raw[r]?.[c] ?? "").trim();
        if (cell.startsWith("http://") || cell.startsWith("https://")) {
          imgCols.add(c);
          break;
        }
      }
    }
    imageColIndices = [...imgCols].sort((a, b) => a - b);
  }

  const headerRow = raw[headerRowIdx] ?? [];

  // ── Question columns ────────────────────────────────────────────
  // Anything that is neither a mapped metadata field, nor an image column, nor
  // standard Perigee visit metadata is a form question.
  const usedIndices = new Set<number>(Object.values(colMap));
  for (const ci of imageColIndices ?? []) usedIndices.add(ci);
  if (imageColIndices === null) {
    for (let i = 1; i <= 5; i++) {
      const idx = colMap[`image${i}`];
      if (idx !== undefined) usedIndices.add(idx);
    }
  }

  const colCount = Math.max(...raw.map((r) => r.length), headerRow.length);
  const questionCols: { index: number; question: string }[] = [];
  for (let c = 0; c < colCount; c++) {
    if (usedIndices.has(c)) continue;
    const label = String(headerRow[c] ?? "").trim();
    if (!label) continue;
    if (META_HEADERS.has(norm(label))) continue;
    questionCols.push({ index: c, question: label });
  }

  // Parse data rows
  const rows: TaskRow[] = [];
  let firstTitle = "";
  const answersByQuestion = new Map<string, string[]>();
  for (const q of questionCols) answersByQuestion.set(q.question, []);

  for (let r = headerRowIdx + 1; r < raw.length; r++) {
    const row = raw[r];
    // Skip completely empty rows
    if (row.every((c) => String(c).trim() === "")) continue;

    const val = (key: string) => {
      const idx = colMap[key];
      return idx !== undefined ? String(row[idx] ?? "").trim() : "";
    };

    const title = val("title");
    if (title && !firstTitle) firstTitle = title;

    // Collect images
    const images: string[] = [];
    if (imageColIndices) {
      // Explicit image columns from mapping
      for (const ci of imageColIndices) {
        const url = String(row[ci] ?? "").trim();
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          images.push(url);
        }
      }
    } else {
      // Auto-detect: image1-image5 keys
      for (let i = 1; i <= 5; i++) {
        const url = val(`image${i}`);
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          images.push(url);
        }
      }
    }

    // Collect form answers
    const answers: QAPair[] = [];
    for (const q of questionCols) {
      const answer = String(row[q.index] ?? "").trim();
      if (!answer) continue;
      answers.push({ question: q.question, answer });
      answersByQuestion.get(q.question)!.push(answer);
    }

    const dateIdx = colMap["date"];

    rows.push({
      title,
      notes: val("notes"),
      channel: val("channel"),
      store: val("store"),
      storeCode: val("storeCode"),
      storeFullName: val("storeFullName"),
      createdBy: val("createdBy"),
      replyStatus: val("replyStatus"),
      replyBy: val("replyBy"),
      replyNotes: val("replyNotes"),
      replyResponse: val("replyResponse"),
      visitId: val("visitId"),
      date: dateIdx !== undefined ? formatDate(row[dateIdx]) : "",
      answers,
      images,
    });
  }

  // Calculate status summary
  const summary: StatusSummary = {
    total: rows.length,
    completed: 0,
    notCompleted: 0,
    pending: 0,
    expired: 0,
    blank: 0,
  };

  for (const row of rows) {
    const s = row.replyStatus.toLowerCase().trim();
    if (s === "completed") summary.completed++;
    else if (s === "not completed" || s === "incomplete") summary.notCompleted++;
    else if (s === "pending") summary.pending++;
    else if (s === "expired") summary.expired++;
    else if (s === "") summary.blank++;
    else summary.blank++; // Unknown statuses go to blank
  }

  // Question analysis
  const questionStats: QuestionStat[] = questionCols.map((q) =>
    analyseQuestion(q.question, answersByQuestion.get(q.question)!)
  );

  // Task exports carry a status column; form/relay exports do not.
  const mode: ExportMode =
    colMap["replyStatus"] !== undefined || rows.some((r) => r.replyStatus !== "")
      ? "task"
      : "form";

  const visits = groupVisits(rows, questionStats);
  const deckSummary: DeckSummary = {
    uniqueSites: new Set(rows.map((r) => r.store).filter(Boolean)).size,
    totalVisits: visits.length,
    totalPictures: rows.reduce((sum, r) => sum + r.images.length, 0),
    uniqueQuestions: questionCols.length,
    totalAnswers: questionStats.reduce((sum, q) => sum + q.answered, 0),
  };

  return {
    title: firstTitle || "Untitled Report",
    mode,
    rows,
    summary,
    deckSummary,
    questionStats,
  };
}

