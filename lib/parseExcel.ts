import * as XLSX from "xlsx";
import type { TaskRow, ParsedData, StatusSummary } from "./types";

/**
 * Column mappings — maps canonical field names to possible Excel header variants.
 * Case-insensitive matching. First match wins.
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
 * Parse an uploaded Excel buffer into structured ParsedData.
 * Auto-detects header row (first row where >= 3 known columns match).
 */
export function parseExcel(buffer: Buffer): ParsedData {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in workbook");

  const sheet = wb.Sheets[sheetName];
  const raw: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (raw.length < 2) throw new Error("File has fewer than 2 rows");

  // Find header row — scan first 10 rows for the one with most matched columns
  let headerRowIdx = 0;
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

  // Build column index map: field key → column index
  const headerRow = raw[headerRowIdx];
  const colMap: Record<string, number> = {};

  for (const [fieldKey, aliases] of Object.entries(COLUMN_MAP)) {
    for (let c = 0; c < headerRow.length; c++) {
      const n = norm(String(headerRow[c]));
      if (aliases.includes(n)) {
        colMap[fieldKey] = c;
        break;
      }
    }
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

    // Collect images (non-empty URLs)
    const images: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const url = val(`image${i}`);
      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        images.push(url);
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
