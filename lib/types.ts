/* ------------------------------------------------------------------ */
/*  iRAM PPT Builder — shared types                                   */
/* ------------------------------------------------------------------ */

/** A single question/answer captured on a form row */
export interface QAPair {
  question: string;
  answer: string;
}

/**
 * A single row parsed from a Perigee export.
 *
 * Task exports have one row per store task. Form/relay exports have one row
 * per *answer set* — a single store visit can produce many rows (e.g. one per
 * damaged item), which is why slides are built from grouped visits rather than
 * from rows. See groupVisits().
 */
export interface TaskRow {
  title: string;
  notes: string;
  channel: string;
  store: string;
  storeCode: string;
  storeFullName: string;
  createdBy: string;
  replyStatus: string;       // "Completed", "Pending", "Expired", etc.
  replyBy: string;
  replyNotes: string;
  replyResponse: string;
  visitId: string;            // Perigee ID / Visit UUID, when present
  date: string;               // Formatted visit date, "" when absent
  answers: QAPair[];          // Form question columns with a non-empty answer
  images: string[];           // Perigee image URLs found on this row
}

/** Summary counts derived from reply statuses (task exports only) */
export interface StatusSummary {
  total: number;
  completed: number;
  notCompleted: number;
  pending: number;
  expired: number;
  blank: number;
}

/** Headline counts shown on the overview slide */
export interface DeckSummary {
  uniqueSites: number;
  totalVisits: number;
  totalPictures: number;
  uniqueQuestions: number;
  totalAnswers: number;
}

/**
 * How a question column's answers behave.
 * - "choice"  → a small set of repeated values (Yes/No, dropdowns) — counted
 * - "numeric" → mostly numbers (barcodes, quantities, values) — not counted
 * - "text"    → free text — not counted
 */
export type QuestionKind = "choice" | "numeric" | "text";

/** Per-question response analysis */
export interface QuestionStat {
  question: string;
  kind: QuestionKind;
  answered: number;                              // non-empty answers
  options: { label: string; count: number }[];   // populated for "choice" only
}

/** One store visit — all rows sharing a store + date, merged */
export interface StoreVisit {
  store: string;
  storeCode: string;
  channel: string;
  date: string;
  replyStatus: string;
  replyBy: string;
  replyNotes: string;
  rowCount: number;
  images: { url: string; caption: string }[];
}

/** Which kind of Perigee export we are dealing with */
export type ExportMode = "task" | "form";

/** Full result of parsing an Excel file */
export interface ParsedData {
  title: string;              // From "Title" column (first non-empty value)
  mode: ExportMode;
  rows: TaskRow[];
  summary: StatusSummary;
  deckSummary: DeckSummary;
  questionStats: QuestionStat[];
}

/** Maps internal field keys to actual Excel column header text */
export interface ColumnMapping {
  title?: string;
  notes?: string;
  channel?: string;
  store?: string;
  storeCode?: string;
  storeFullName?: string;
  createdBy?: string;
  replyStatus?: string;
  replyBy?: string;
  replyNotes?: string;
  replyResponse?: string;
  visitId?: string;
  date?: string;
  imageColumns?: string[];    // 1-10 column names containing image URLs
}

/** A configurable PPT template stored in Vercel Blob */
export interface PptTemplate {
  id: string;
  name: string;               // e.g. "iRAM Standard", "Clover Leaf"
  primaryColor: string;       // Hex without # e.g. "003B75"
  accentColor: string;        // Hex without # e.g. "E04E2A"
  logoUrl: string | null;     // Blob URL for uploaded logo
  fontFamily: string;         // Default "Arial"
  columnMapping?: ColumnMapping | null;  // Custom Excel column mapping
  pptxTemplateUrl?: string | null;       // Blob URL of uploaded .pptx master
  outputNaming?: string;                 // Pattern: "{title}_Report" (default)
  createdAt: string;
  updatedAt: string;
}

/** Image data ready for embedding in PPTX */
export interface ImageData {
  data: string;               // base64 string
  type: "jpeg" | "png";
}
