import * as XLSX from "xlsx";
import type { TaskRow, ParsedData, StatusSummary, ColumnMapping } from "./types";

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
  image1:         ["image 1", "image1", "photo 1", "photo1"],
  image2:         ["image 2", "image2", "photo 2", "photo2"],
  image3:         ["image 3", "image3", "photo 3", "photo3"],
  image4:         ["image 4", "image4", "photo 4", "photo4"],
  image5:         ["image 5", "image5", "photo 5", "photo5"],
};

/** Normalise a header cell value for matching */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
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

/**
 * Build colMap from an explicit ColumnMapping (non-image fields).
 * Matches mapping values to header row by normalised comparison.
 */
function buildColMapFromMapping(
  mapping: ColumnMapping,
  headerRow: string[]
): Record<string, number> {
  const colMap: Record<string, number> = {};
  const fields: (keyof Omit<ColumnMapping, "imageColumns">)[] = [
    "title", "notes", "channel", "store", "storeCode",
    "storeFullName", "createdBy", "replyStatus", "replyBy",
    "replyNotes", "replyResponse",
  ];

  for (const field of fields) {
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
    const fields: (keyof Omit<ColumnMapping, "imageColumns">)[] = [
      "title", "notes", "channel", "store", "storeCode",
      "storeFullName", "createdBy", "replyStatus", "replyBy",
      "replyNotes", "replyResponse",
    ];
    for (const f of fields) {
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

  // Parse data rows
  const rows: TaskRow[] = [];
  let firstTitle = "";

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
      images,
    });
  }

  // Calculate summary
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

  return {
    title: firstTitle || "Untitled Report",
    rows,
    summary,
  };
}
