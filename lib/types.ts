/* ------------------------------------------------------------------ */
/*  iRAM PPT Builder — shared types                                   */
/* ------------------------------------------------------------------ */

/** A single task row parsed from the Perigee Excel export */
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
  images: string[];           // Up to 5 Perigee image URLs
}

/** Summary counts derived from reply statuses */
export interface StatusSummary {
  total: number;
  completed: number;
  notCompleted: number;
  pending: number;
  expired: number;
  blank: number;
}

/** Full result of parsing an Excel file */
export interface ParsedData {
  title: string;              // From "Title" column (first non-empty value)
  rows: TaskRow[];
  summary: StatusSummary;
}

/** A configurable PPT template stored in Vercel Blob */
export interface PptTemplate {
  id: string;
  name: string;               // e.g. "iRAM Standard", "Clover Leaf"
  primaryColor: string;       // Hex without # e.g. "003B75"
  accentColor: string;        // Hex without # e.g. "E04E2A"
  logoUrl: string | null;     // Blob URL for uploaded logo
  fontFamily: string;         // Default "Arial"
  createdAt: string;
  updatedAt: string;
}

/** Image data ready for embedding in PPTX */
export interface ImageData {
  data: string;               // base64 string
  type: "jpeg" | "png";
}
