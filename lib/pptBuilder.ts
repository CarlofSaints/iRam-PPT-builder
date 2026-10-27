import PptxGenJS from "pptxgenjs";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { groupVisits, IMAGES_PER_SLIDE } from "./visits";
import { fetchAllowed, isOwnBlobUrl } from "./urlGuard";
import type {
  ParsedData,
  PptTemplate,
  ImageData,
  StoreVisit,
  QuestionStat,
  DeckSummary,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Dimensions — inches (pptxgenjs default unit)                      */
/* ------------------------------------------------------------------ */
const SLIDE_W = 10;
const SLIDE_H = 5.625; // 16:9

const MARGIN = 0.4;
const CONTENT_W = SLIDE_W - MARGIN * 2;

/** Emoji need a font that actually has the glyphs. */
const EMOJI_FONT = "Segoe UI Emoji";

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */
function hex(c: string): string {
  return c.replace(/^#/, "");
}

function statusColor(status: string): string {
  const s = status.toLowerCase().trim();
  if (s === "completed") return "2E7D32";      // green
  if (s === "not completed" || s === "incomplete") return "C62828"; // red
  if (s === "pending") return "F57F17";         // amber
  if (s === "expired") return "6A1B9A";         // purple
  return "757575";                                // grey
}

/* ------------------------------------------------------------------ */
/*  Fallback logo: white iRam logo (title/closing slides are green)   */
/* ------------------------------------------------------------------ */
let _fallbackLogoBase64: string | null | undefined; // undefined = not loaded yet

function getFallbackLogo(): string | null {
  if (_fallbackLogoBase64 !== undefined) return _fallbackLogoBase64;
  try {
    const logoPath = join(process.cwd(), "public", "iram-logo-white.png");
    if (existsSync(logoPath)) {
      const buf = readFileSync(logoPath);
      _fallbackLogoBase64 = buf.toString("base64");
    } else {
      _fallbackLogoBase64 = null;
    }
  } catch {
    _fallbackLogoBase64 = null;
  }
  return _fallbackLogoBase64;
}

/** The template logo as embeddable data. Only this app's own Blob images; never handed to
 *  pptxgenjs as a path, which would read a local file or fetch any URL. */
async function logoAsData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const got = await fetchAllowed(url, isOwnBlobUrl, 5 * 1024 * 1024);
    if (!got || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(got.type)) return null;
    return `${got.type};base64,${Buffer.from(got.buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  .pptx template: extract background image via JSZip                 */
/* ------------------------------------------------------------------ */
async function extractPptxBackground(
  pptxUrl: string
): Promise<string | null> {
  try {
    const JSZip = (await import("jszip")).default;
    // Only this app's own uploaded .pptx (the URL is stored from requests).
    const got = await fetchAllowed(pptxUrl, isOwnBlobUrl, 25 * 1024 * 1024);
    if (!got) return null;
    const buf = got.buf;
    const zip = await JSZip.loadAsync(buf);

    // Look for slide master background image (common locations)
    const imgPaths = [
      "ppt/media/image1.png",
      "ppt/media/image1.jpeg",
      "ppt/media/image1.jpg",
      "ppt/media/image2.png",
      "ppt/media/image2.jpeg",
      "ppt/media/image2.jpg",
    ];

    for (const path of imgPaths) {
      const file = zip.file(path);
      if (file) {
        const data = await file.async("base64");
        const ext = path.endsWith(".png") ? "png" : "jpeg";
        return `image/${ext};base64,${data}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Older cached parses may predate these fields — never trust them to exist. */
function safeDeckSummary(data: ParsedData): DeckSummary {
  if (data.deckSummary) return data.deckSummary;
  return {
    uniqueSites: new Set(data.rows.map((r) => r.store).filter(Boolean)).size,
    totalVisits: 0,
    totalPictures: data.rows.reduce((s, r) => s + (r.images?.length ?? 0), 0),
    uniqueQuestions: 0,
    totalAnswers: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Public: build a PPTX from parsed data + template + images          */
/* ------------------------------------------------------------------ */
export async function buildPptx(
  data: ParsedData,
  template: PptTemplate,
  imageMap: Map<string, ImageData>         // url → processed image
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";            // 13.33 x 7.5  (we'll use 10 x 5.625 override)
  pptx.defineLayout({ name: "CUSTOM", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "CUSTOM";

  const primary = hex(template.primaryColor);
  const accent  = hex(template.accentColor);
  const font    = template.fontFamily || "Arial";

  // Extract background from uploaded .pptx template (if any)
  let bgImage: string | null = null;
  if (template.pptxTemplateUrl) {
    bgImage = await extractPptxBackground(template.pptxTemplateUrl);
  }

  // Resolve logo: template logo → fallback iRAM logo → null
  const logoData = (await logoAsData(template.logoUrl)) || (() => {
    const fb = getFallbackLogo();
    return fb ? `image/png;base64,${fb}` : null;
  })();

  const questionStats = data.questionStats ?? [];
  const deckSummary = safeDeckSummary(data);
  const isTask = data.mode !== "form";

  // ── Slide 1: Title ──────────────────────────────────────────────
  addTitleSlide(pptx, data, template, logoData, primary, accent, font, bgImage);

  // ── Slide 2: Overview cards ─────────────────────────────────────
  addOverviewSlide(pptx, data, deckSummary, primary, accent, font, bgImage);

  // ── Task Info (only useful when the export carries task notes) ──
  if (data.rows[0]?.notes) {
    addTaskInfoSlide(pptx, data, primary, accent, font, bgImage);
  }

  // ── Status summary — task exports only. Form exports have no reply
  //    status, so this slide used to report every row as "Blank". ──
  if (isTask) {
    addSummarySlide(pptx, data, primary, accent, font, bgImage);
  }

  // ── Response breakdown for choice questions (Yes/No, dropdowns) ──
  addQuestionSlides(pptx, questionStats, primary, accent, font, bgImage);

  // ── Store slides ────────────────────────────────────────────────
  // One slide per store *visit*, not per row. Form/relay exports emit one row
  // per answer set, so a single visit arrives as many rows — building a slide
  // each produced long runs of slides with an identical header. Photos for a
  // visit are paged IMAGES_PER_SLIDE at a time so none are dropped.
  const visits = groupVisits(data.rows, questionStats);

  for (const visit of visits) {
    // Skip a visit only when it has an explicit status that isn't "completed"
    // (task-report exports). Form/relay exports have no status column.
    const status = visit.replyStatus.toLowerCase().trim();
    if (status && status !== "completed") continue;

    // Resolve the images we actually downloaded, preserving order.
    const imgs: { img: ImageData; caption: string }[] = [];
    for (const { url, caption } of visit.images) {
      const img = imageMap.get(url);
      if (img) imgs.push({ img, caption });
    }
    if (imgs.length === 0) continue;

    const pageCount = Math.ceil(imgs.length / IMAGES_PER_SLIDE);
    for (let p = 0; p < pageCount; p++) {
      const chunk = imgs.slice(p * IMAGES_PER_SLIDE, p * IMAGES_PER_SLIDE + IMAGES_PER_SLIDE);
      const pageInfo = pageCount > 1 ? { page: p + 1, total: pageCount } : null;
      addStoreSlide(pptx, visit, chunk, primary, accent, font, bgImage, pageInfo);
    }
  }

  // ── Last Slide: Closing ─────────────────────────────────────────
  addClosingSlide(pptx, template, logoData, primary, font, bgImage);

  // Generate buffer
  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}

/* ================================================================== */
/*  Individual slide builders                                          */
/* ================================================================== */

function addTitleSlide(
  pptx: PptxGenJS,
  data: ParsedData,
  template: PptTemplate,
  logoData: string | null,
  primary: string,
  accent: string,
  font: string,
  bgImage: string | null
) {
  const slide = pptx.addSlide();
  if (bgImage) {
    slide.background = { data: bgImage };
  } else {
    slide.background = { color: primary };
  }

  // Accent bar at bottom
  slide.addShape("rect", {
    x: 0,
    y: SLIDE_H - 0.15,
    w: SLIDE_W,
    h: 0.15,
    fill: { color: accent },
  });

  // Logo (top-right) — template logo, fallback logo, or none
  if (logoData) {
    const imgOpts: Record<string, unknown> = {
      x: SLIDE_W - 2.2,
      y: 0.3,
      w: 1.8,
      h: 0.9,
      sizing: { type: "contain", w: 1.8, h: 0.9 },
    };
    imgOpts.data = logoData; // always data (logoAsData / fallback), never a path
    slide.addImage(imgOpts);
  }

  // Title text
  slide.addText(data.title, {
    x: MARGIN,
    y: 1.4,
    w: CONTENT_W,
    h: 1.2,
    fontSize: 32,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
  });

  // Subtitle
  slide.addText(data.mode === "form" ? "Form Report" : "Task Report", {
    x: MARGIN,
    y: 2.6,
    w: CONTENT_W,
    h: 0.6,
    fontSize: 18,
    fontFace: font,
    color: accent,
  });

  // Reporting period from the data, falling back to the generation date
  const dates = data.rows.map((r) => r.date).filter(Boolean);
  const period = dateRangeLabel(dates);
  const dateStr =
    period ||
    new Date().toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  slide.addText(dateStr, {
    x: MARGIN,
    y: 3.2,
    w: CONTENT_W,
    h: 0.4,
    fontSize: 12,
    fontFace: font,
    color: "CCCCCC",
  });
}

/** "05 Jun 2026 – 23 Jul 2026", or a single date, or "" when there are none. */
function dateRangeLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const parsed = dates
    .map((d) => ({ label: d, time: Date.parse(d) }))
    .filter((d) => !isNaN(d.time))
    .sort((a, b) => a.time - b.time);
  if (parsed.length === 0) return "";
  const from = parsed[0].label;
  const to = parsed[parsed.length - 1].label;
  return from === to ? from : `${from} – ${to}`;
}

/**
 * Slide 2 — headline counts as icon cards.
 * Task exports have no form questions, so the last two cards fall back to task
 * counts rather than showing two zeroes.
 */
function addOverviewSlide(
  pptx: PptxGenJS,
  data: ParsedData,
  s: DeckSummary,
  primary: string,
  accent: string,
  font: string,
  bgImage: string | null
) {
  const slide = pptx.addSlide();
  if (bgImage) slide.background = { data: bgImage };

  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 0.7, fill: { color: primary } });
  slide.addText("Overview", {
    x: MARGIN, y: 0.1, w: CONTENT_W, h: 0.5,
    fontSize: 22, fontFace: font, color: "FFFFFF", bold: true,
  });
  slide.addShape("rect", { x: 0, y: 0.7, w: SLIDE_W, h: 0.04, fill: { color: accent } });

  const cards: { icon: string; value: number; label: string }[] = [
    { icon: "🏪", value: s.uniqueSites,    label: "Unique Sites" },
    { icon: "📍", value: s.totalVisits,    label: "Total Visits" },
    { icon: "📷", value: s.totalPictures,  label: "Pictures Loaded" },
  ];

  if (s.uniqueQuestions > 0) {
    cards.push(
      { icon: "❓", value: s.uniqueQuestions, label: "Unique Questions" },
      { icon: "✅", value: s.totalAnswers,    label: "Questions Answered" }
    );
  } else {
    cards.push(
      { icon: "📋", value: data.summary.total,     label: "Total Tasks" },
      { icon: "✅", value: data.summary.completed, label: "Completed" }
    );
  }

  const cardW = 1.72;
  const cardH = 2.15;
  const gap = 0.15;
  const totalW = cards.length * cardW + (cards.length - 1) * gap;
  const startX = (SLIDE_W - totalW) / 2;
  const startY = 1.55;

  cards.forEach((card, i) => {
    const x = startX + i * (cardW + gap);

    slide.addShape("roundRect", {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: primary },
      rectRadius: 0.1,
    });

    // Icon chip
    slide.addShape("ellipse", {
      x: x + (cardW - 0.62) / 2, y: startY + 0.18, w: 0.62, h: 0.62,
      fill: { color: "FFFFFF" },
    });
    slide.addText(card.icon, {
      x: x + (cardW - 0.62) / 2, y: startY + 0.18, w: 0.62, h: 0.62,
      fontSize: 20, fontFace: EMOJI_FONT, align: "center", valign: "middle",
    });

    slide.addText(String(card.value), {
      x, y: startY + 0.92, w: cardW, h: 0.65,
      fontSize: 30, fontFace: font, color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });

    slide.addText(card.label, {
      x: x + 0.08, y: startY + 1.55, w: cardW - 0.16, h: 0.5,
      fontSize: 9, fontFace: font, color: "FFFFFF",
      align: "center", valign: "top", wrap: true,
    });
  });
}

function addTaskInfoSlide(
  pptx: PptxGenJS,
  data: ParsedData,
  primary: string,
  accent: string,
  font: string,
  bgImage: string | null
) {
  const slide = pptx.addSlide();
  if (bgImage) slide.background = { data: bgImage };

  // Header bar
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.7,
    fill: { color: primary },
  });
  slide.addText("Task Information", {
    x: MARGIN,
    y: 0.1,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 22,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
  });

  // Accent underline
  slide.addShape("rect", {
    x: 0,
    y: 0.7,
    w: SLIDE_W,
    h: 0.04,
    fill: { color: accent },
  });

  // Task title
  slide.addText("Task Title:", {
    x: MARGIN,
    y: 1.0,
    w: 1.5,
    h: 0.4,
    fontSize: 14,
    fontFace: font,
    bold: true,
    color: primary,
  });
  slide.addText(data.title, {
    x: MARGIN + 1.5,
    y: 1.0,
    w: CONTENT_W - 1.5,
    h: 0.4,
    fontSize: 14,
    fontFace: font,
    color: "333333",
  });

  // Task notes (from first row)
  const notes = data.rows[0]?.notes || "";
  if (notes) {
    slide.addText("Instructions:", {
      x: MARGIN,
      y: 1.6,
      w: 1.5,
      h: 0.4,
      fontSize: 14,
      fontFace: font,
      bold: true,
      color: primary,
    });
    slide.addText(notes, {
      x: MARGIN,
      y: 2.1,
      w: CONTENT_W,
      h: 2.8,
      fontSize: 12,
      fontFace: font,
      color: "555555",
      valign: "top",
      wrap: true,
    });
  }
}

function addSummarySlide(
  pptx: PptxGenJS,
  data: ParsedData,
  primary: string,
  accent: string,
  font: string,
  bgImage: string | null
) {
  const slide = pptx.addSlide();
  if (bgImage) slide.background = { data: bgImage };

  // Header bar
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.7,
    fill: { color: primary },
  });
  slide.addText("Task Status", {
    x: MARGIN,
    y: 0.1,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 22,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
  });
  slide.addShape("rect", {
    x: 0,
    y: 0.7,
    w: SLIDE_W,
    h: 0.04,
    fill: { color: accent },
  });

  // Summary boxes
  const items = [
    { label: "Total Tasks",     count: data.summary.total,        color: primary },
    { label: "Completed",       count: data.summary.completed,    color: "2E7D32" },
    { label: "Not Completed",   count: data.summary.notCompleted, color: "C62828" },
    { label: "Pending",         count: data.summary.pending,      color: "F57F17" },
    { label: "Expired",         count: data.summary.expired,      color: "6A1B9A" },
    { label: "Blank / Other",   count: data.summary.blank,        color: "757575" },
  ];

  const boxW = 1.35;
  const boxH = 1.4;
  const gap = 0.15;
  const totalW = items.length * boxW + (items.length - 1) * gap;
  const startX = (SLIDE_W - totalW) / 2;
  const startY = 1.5;

  for (let i = 0; i < items.length; i++) {
    const x = startX + i * (boxW + gap);
    const item = items[i];

    slide.addShape("roundRect", {
      x,
      y: startY,
      w: boxW,
      h: boxH,
      fill: { color: item.color },
      rectRadius: 0.08,
    });
    slide.addText(String(item.count), {
      x,
      y: startY + 0.15,
      w: boxW,
      h: 0.7,
      fontSize: 36,
      fontFace: font,
      color: "FFFFFF",
      bold: true,
      align: "center",
    });
    slide.addText(item.label, {
      x,
      y: startY + 0.85,
      w: boxW,
      h: 0.4,
      fontSize: 10,
      fontFace: font,
      color: "FFFFFF",
      align: "center",
    });
  }

  // Completion % bar
  const pct = data.summary.total > 0
    ? Math.round((data.summary.completed / data.summary.total) * 100)
    : 0;
  const barY = startY + boxH + 0.6;
  const barW = CONTENT_W;

  slide.addShape("roundRect", {
    x: MARGIN,
    y: barY,
    w: barW,
    h: 0.35,
    fill: { color: "E0E0E0" },
    rectRadius: 0.05,
  });
  if (pct > 0) {
    slide.addShape("roundRect", {
      x: MARGIN,
      y: barY,
      w: barW * (pct / 100),
      h: 0.35,
      fill: { color: "2E7D32" },
      rectRadius: 0.05,
    });
  }
  slide.addText(`${pct}% Complete`, {
    x: MARGIN,
    y: barY,
    w: barW,
    h: 0.35,
    fontSize: 12,
    fontFace: font,
    color: pct > 50 ? "FFFFFF" : "333333",
    bold: true,
    align: "center",
  });
}

/* ------------------------------------------------------------------ */
/*  Response breakdown                                                 */
/* ------------------------------------------------------------------ */

const Q_BODY_TOP = 0.95;
const Q_BOTTOM = SLIDE_H - 0.25;
const Q_COL_W = (CONTENT_W - 0.4) / 2;
const Q_ROW_H = 0.26;
const Q_MAX_OPTIONS = 8;

/** Height a question block needs, including its options. */
function questionBlockHeight(q: QuestionStat): number {
  const titleLines = Math.min(2, Math.ceil(q.question.length / 46) || 1);
  const shown = Math.min(q.options.length, Q_MAX_OPTIONS);
  const overflow = q.options.length > Q_MAX_OPTIONS ? Q_ROW_H : 0;
  return titleLines * 0.22 + 0.1 + shown * Q_ROW_H + overflow;
}

/**
 * One or more slides counting the responses to every choice question —
 * Yes/No answers and dropdown selections. Free-text and numeric columns are
 * deliberately skipped: counting unique sentences or barcodes tells you nothing.
 */
function addQuestionSlides(
  pptx: PptxGenJS,
  questionStats: QuestionStat[],
  primary: string,
  accent: string,
  font: string,
  bgImage: string | null
) {
  const choices = questionStats.filter(
    (q) => q.kind === "choice" && q.options.length > 0
  );
  if (choices.length === 0) return;

  const newSlide = () => {
    const slide = pptx.addSlide();
    if (bgImage) slide.background = { data: bgImage };
    slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 0.7, fill: { color: primary } });
    slide.addText("Response Breakdown", {
      x: MARGIN, y: 0.1, w: CONTENT_W, h: 0.5,
      fontSize: 22, fontFace: font, color: "FFFFFF", bold: true,
    });
    slide.addShape("rect", { x: 0, y: 0.7, w: SLIDE_W, h: 0.04, fill: { color: accent } });
    return slide;
  };

  let slide = newSlide();
  let col = 0;
  let y = Q_BODY_TOP;

  for (const q of choices) {
    const h = questionBlockHeight(q);

    if (y + h > Q_BOTTOM && y > Q_BODY_TOP) {
      col++;
      y = Q_BODY_TOP;
      if (col > 1) {
        slide = newSlide();
        col = 0;
      }
    }

    const x = MARGIN + col * (Q_COL_W + 0.4);
    renderQuestionBlock(slide, q, x, y, primary, accent, font);
    y += h + 0.24;
  }
}

function renderQuestionBlock(
  slide: ReturnType<PptxGenJS["addSlide"]>,
  q: QuestionStat,
  x: number,
  y: number,
  primary: string,
  accent: string,
  font: string
) {
  const titleLines = Math.min(2, Math.ceil(q.question.length / 46) || 1);
  const titleH = titleLines * 0.22;

  slide.addText(`${q.question}  (${q.answered})`, {
    x, y, w: Q_COL_W, h: titleH,
    fontSize: 10, fontFace: font, color: primary, bold: true,
    valign: "top", wrap: true,
  });

  const labelW = Q_COL_W * 0.44;
  const barX = x + labelW + 0.06;
  const barMaxW = Q_COL_W * 0.38;
  const countX = barX + barMaxW + 0.06;
  const maxCount = Math.max(...q.options.map((o) => o.count), 1);

  let rowY = y + titleH + 0.1;
  const shown = q.options.slice(0, Q_MAX_OPTIONS);

  for (const opt of shown) {
    slide.addText(opt.label, {
      x, y: rowY, w: labelW, h: Q_ROW_H,
      fontSize: 9, fontFace: font, color: "555555", valign: "middle",
    });

    slide.addShape("roundRect", {
      x: barX, y: rowY + 0.07, w: barMaxW, h: 0.12,
      fill: { color: "E8E8E8" }, rectRadius: 0.04,
    });
    slide.addShape("roundRect", {
      x: barX, y: rowY + 0.07,
      w: Math.max(0.06, barMaxW * (opt.count / maxCount)), h: 0.12,
      fill: { color: accent }, rectRadius: 0.04,
    });

    slide.addText(String(opt.count), {
      x: countX, y: rowY, w: Q_COL_W - (countX - x), h: Q_ROW_H,
      fontSize: 9, fontFace: font, color: "333333", bold: true, valign: "middle",
    });

    rowY += Q_ROW_H;
  }

  if (q.options.length > Q_MAX_OPTIONS) {
    slide.addText(`+ ${q.options.length - Q_MAX_OPTIONS} more`, {
      x, y: rowY, w: Q_COL_W, h: Q_ROW_H,
      fontSize: 8, fontFace: font, color: "999999", italic: true, valign: "middle",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Store visit slides                                                 */
/* ------------------------------------------------------------------ */

function addStoreSlide(
  pptx: PptxGenJS,
  visit: StoreVisit,
  imgs: { img: ImageData; caption: string }[],
  primary: string,
  accent: string,
  font: string,
  bgImage: string | null,
  pageInfo: { page: number; total: number } | null = null
) {
  const slide = pptx.addSlide();
  if (bgImage) slide.background = { data: bgImage };

  // Header bar
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.65,
    fill: { color: primary },
  });

  // Store name + code (+ page indicator when photos span multiple slides)
  const baseLine = visit.storeCode
    ? `${visit.storeCode} — ${visit.store}`
    : visit.store;
  const storeLine = pageInfo
    ? `${baseLine}  (${pageInfo.page}/${pageInfo.total})`
    : baseLine;

  const hasStatus = visit.replyStatus.trim() !== "";
  const statusW = 1.5;
  const dateW = 1.9;
  const rightEdge = SLIDE_W - MARGIN;
  const statusX = rightEdge - statusW;
  const dateX = hasStatus ? statusX - 0.15 - dateW : rightEdge - dateW;
  const titleW = (visit.date ? dateX : hasStatus ? statusX : rightEdge) - MARGIN - 0.15;

  slide.addText(storeLine, {
    x: MARGIN,
    y: 0.08,
    w: Math.max(2, titleW),
    h: 0.5,
    fontSize: 18,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
    valign: "middle",
  });

  // Visit date
  if (visit.date) {
    slide.addText(visit.date, {
      x: dateX,
      y: 0.08,
      w: dateW,
      h: 0.5,
      fontSize: 11,
      fontFace: font,
      color: "FFFFFF",
      align: "right",
      valign: "middle",
    });
  }

  // Status badge — task exports only; form exports have no status
  if (hasStatus) {
    const sc = statusColor(visit.replyStatus);
    slide.addShape("roundRect", {
      x: statusX,
      y: 0.12,
      w: statusW,
      h: 0.4,
      fill: { color: sc },
      rectRadius: 0.06,
    });
    slide.addText(visit.replyStatus, {
      x: statusX,
      y: 0.12,
      w: statusW,
      h: 0.4,
      fontSize: 10,
      fontFace: font,
      color: "FFFFFF",
      bold: true,
      align: "center",
    });
  }

  // Accent underline
  slide.addShape("rect", {
    x: 0,
    y: 0.65,
    w: SLIDE_W,
    h: 0.03,
    fill: { color: accent },
  });

  // Rep name + reply notes (left info panel). Form exports carry neither, so
  // the photos take the full slide width instead of leaving a blank column.
  const hasPanel = Boolean(visit.replyBy || visit.replyNotes);
  let infoY = 0.8;
  if (visit.replyBy) {
    slide.addText(`Rep: ${visit.replyBy}`, {
      x: MARGIN,
      y: infoY,
      w: 3,
      h: 0.3,
      fontSize: 10,
      fontFace: font,
      color: "555555",
    });
    infoY += 0.3;
  }
  if (visit.replyNotes) {
    slide.addText(visit.replyNotes, {
      x: MARGIN,
      y: infoY,
      w: 3,
      h: 0.6,
      fontSize: 9,
      fontFace: font,
      color: "777777",
      valign: "top",
      wrap: true,
    });
  }

  if (imgs.length === 0) return;

  // Image layout area
  const imgStartX = hasPanel ? 3.6 : MARGIN;
  const imgStartY = 0.8;
  const imgAreaW = SLIDE_W - imgStartX - MARGIN;
  const imgAreaH = SLIDE_H - imgStartY - 0.2;

  const layouts = getImageLayout(imgs.length, imgStartX, imgStartY, imgAreaW, imgAreaH);
  const captionH = imgs.some((i) => i.caption) ? 0.2 : 0;

  for (let i = 0; i < layouts.length && i < imgs.length; i++) {
    const { x, y, w, h } = layouts[i];
    const picH = h - captionH;

    slide.addImage({
      data: `image/jpeg;base64,${imgs[i].img.data}`,
      x,
      y,
      w,
      h: picH,
      sizing: { type: "contain", w, h: picH },
    });

    if (captionH && imgs[i].caption) {
      slide.addText(imgs[i].caption, {
        x,
        y: y + picH,
        w,
        h: captionH,
        fontSize: 7,
        fontFace: font,
        color: "666666",
        align: "center",
        valign: "middle",
      });
    }
  }
}

/** Calculate image positions based on count */
function getImageLayout(
  count: number,
  startX: number,
  startY: number,
  areaW: number,
  areaH: number
): Array<{ x: number; y: number; w: number; h: number }> {
  const gap = 0.08;

  if (count === 1) {
    return [{ x: startX, y: startY, w: areaW, h: areaH }];
  }

  if (count === 2) {
    const w = (areaW - gap) / 2;
    return [
      { x: startX, y: startY, w, h: areaH },
      { x: startX + w + gap, y: startY, w, h: areaH },
    ];
  }

  if (count === 3) {
    const topH = areaH * 0.55;
    const botH = areaH - topH - gap;
    const halfW = (areaW - gap) / 2;
    return [
      { x: startX, y: startY, w: areaW, h: topH },
      { x: startX, y: startY + topH + gap, w: halfW, h: botH },
      { x: startX + halfW + gap, y: startY + topH + gap, w: halfW, h: botH },
    ];
  }

  if (count === 4) {
    const halfW = (areaW - gap) / 2;
    const halfH = (areaH - gap) / 2;
    return [
      { x: startX, y: startY, w: halfW, h: halfH },
      { x: startX + halfW + gap, y: startY, w: halfW, h: halfH },
      { x: startX, y: startY + halfH + gap, w: halfW, h: halfH },
      { x: startX + halfW + gap, y: startY + halfH + gap, w: halfW, h: halfH },
    ];
  }

  // 5 images: one large on the left, a 2x2 grid on the right.
  const leftW = areaW * 0.46;
  const rightW = areaW - leftW - gap;
  const cellW = (rightW - gap) / 2;
  const cellH = (areaH - gap) / 2;
  const rightX = startX + leftW + gap;
  return [
    { x: rightX - leftW - gap, y: startY, w: leftW, h: areaH },
    { x: rightX, y: startY, w: cellW, h: cellH },
    { x: rightX + cellW + gap, y: startY, w: cellW, h: cellH },
    { x: rightX, y: startY + cellH + gap, w: cellW, h: cellH },
    { x: rightX + cellW + gap, y: startY + cellH + gap, w: cellW, h: cellH },
  ];
}

function addClosingSlide(
  pptx: PptxGenJS,
  template: PptTemplate,
  logoData: string | null,
  primary: string,
  font: string,
  bgImage: string | null
) {
  const slide = pptx.addSlide();
  if (bgImage) {
    slide.background = { data: bgImage };
  } else {
    slide.background = { color: primary };
  }

  if (logoData) {
    const imgOpts: Record<string, unknown> = {
      x: (SLIDE_W - 3) / 2,
      y: 1.2,
      w: 3,
      h: 1.5,
      sizing: { type: "contain", w: 3, h: 1.5 },
    };
    imgOpts.data = logoData; // always data (logoAsData / fallback), never a path
    slide.addImage(imgOpts);
  }

  slide.addText("Thank You", {
    x: MARGIN,
    y: logoData ? 3.2 : 2.0,
    w: CONTENT_W,
    h: 1,
    fontSize: 36,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
    align: "center",
  });

  slide.addText("Generated by iRAM PPT Builder", {
    x: MARGIN,
    y: SLIDE_H - 0.6,
    w: CONTENT_W,
    h: 0.4,
    fontSize: 10,
    fontFace: font,
    color: "AAAAAA",
    align: "center",
  });
}
