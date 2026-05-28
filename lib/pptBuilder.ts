import PptxGenJS from "pptxgenjs";
import type { ParsedData, PptTemplate, TaskRow, ImageData } from "./types";

/* ------------------------------------------------------------------ */
/*  Dimensions — inches (pptxgenjs default unit)                      */
/* ------------------------------------------------------------------ */
const SLIDE_W = 10;
const SLIDE_H = 5.625; // 16:9

const MARGIN = 0.4;
const CONTENT_W = SLIDE_W - MARGIN * 2;

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

  // ── Slide 1: Title ──────────────────────────────────────────────
  addTitleSlide(pptx, data, template, primary, accent, font);

  // ── Slide 2: Task Info ──────────────────────────────────────────
  addTaskInfoSlide(pptx, data, primary, accent, font);

  // ── Slide 3: Summary ───────────────────────────────────────────
  addSummarySlide(pptx, data, primary, accent, font);

  // ── Slides 4+: Store slides (completed rows with images) ───────
  for (const row of data.rows) {
    if (row.replyStatus.toLowerCase().trim() !== "completed") continue;
    if (row.images.length === 0) continue;
    addStoreSlide(pptx, row, imageMap, primary, accent, font);
  }

  // ── Last Slide: Closing ─────────────────────────────────────────
  addClosingSlide(pptx, template, primary, font);

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
  primary: string,
  accent: string,
  font: string
) {
  const slide = pptx.addSlide();
  slide.background = { color: primary };

  // Accent bar at bottom
  slide.addShape("rect", {
    x: 0,
    y: SLIDE_H - 0.15,
    w: SLIDE_W,
    h: 0.15,
    fill: { color: accent },
  });

  // Logo (top-right) if available
  if (template.logoUrl) {
    slide.addImage({
      path: template.logoUrl,
      x: SLIDE_W - 2.2,
      y: 0.3,
      w: 1.8,
      h: 0.9,
      sizing: { type: "contain", w: 1.8, h: 0.9 },
    });
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
  slide.addText("Task Report", {
    x: MARGIN,
    y: 2.6,
    w: CONTENT_W,
    h: 0.6,
    fontSize: 18,
    fontFace: font,
    color: accent,
  });

  // Date
  const dateStr = new Date().toLocaleDateString("en-ZA", {
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

function addTaskInfoSlide(
  pptx: PptxGenJS,
  data: ParsedData,
  primary: string,
  accent: string,
  font: string
) {
  const slide = pptx.addSlide();

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
  font: string
) {
  const slide = pptx.addSlide();

  // Header bar
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.7,
    fill: { color: primary },
  });
  slide.addText("Summary", {
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

function addStoreSlide(
  pptx: PptxGenJS,
  row: TaskRow,
  imageMap: Map<string, ImageData>,
  primary: string,
  accent: string,
  font: string
) {
  const slide = pptx.addSlide();

  // Header bar
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.65,
    fill: { color: primary },
  });

  // Store name + code
  const storeLine = row.storeCode
    ? `${row.storeCode} — ${row.store}`
    : row.store;
  slide.addText(storeLine, {
    x: MARGIN,
    y: 0.08,
    w: CONTENT_W - 2,
    h: 0.5,
    fontSize: 18,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
  });

  // Status badge
  const sc = statusColor(row.replyStatus);
  slide.addShape("roundRect", {
    x: SLIDE_W - MARGIN - 1.6,
    y: 0.12,
    w: 1.5,
    h: 0.4,
    fill: { color: sc },
    rectRadius: 0.06,
  });
  slide.addText(row.replyStatus, {
    x: SLIDE_W - MARGIN - 1.6,
    y: 0.12,
    w: 1.5,
    h: 0.4,
    fontSize: 10,
    fontFace: font,
    color: "FFFFFF",
    bold: true,
    align: "center",
  });

  // Accent underline
  slide.addShape("rect", {
    x: 0,
    y: 0.65,
    w: SLIDE_W,
    h: 0.03,
    fill: { color: accent },
  });

  // Rep name + reply notes (left info panel)
  let infoY = 0.8;
  if (row.replyBy) {
    slide.addText(`Rep: ${row.replyBy}`, {
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
  if (row.replyNotes) {
    slide.addText(row.replyNotes, {
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

  // Images — collect available ones
  const imgs: ImageData[] = [];
  for (const url of row.images) {
    const img = imageMap.get(url);
    if (img) imgs.push(img);
  }

  if (imgs.length === 0) return;

  // Image layout area
  const imgStartX = 3.6;
  const imgStartY = 0.8;
  const imgAreaW = SLIDE_W - imgStartX - MARGIN;
  const imgAreaH = SLIDE_H - imgStartY - 0.2;

  const layouts = getImageLayout(imgs.length, imgStartX, imgStartY, imgAreaW, imgAreaH);

  for (let i = 0; i < layouts.length && i < imgs.length; i++) {
    const { x, y, w, h } = layouts[i];
    slide.addImage({
      data: `image/jpeg;base64,${imgs[i].data}`,
      x,
      y,
      w,
      h,
      sizing: { type: "contain", w, h },
    });
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

  // 5 images: large left + 2x2 grid right
  const leftW = areaW * 0.5;
  const rightW = areaW - leftW - gap;
  const halfH = (areaH - gap) / 2;
  return [
    { x: startX, y: startY, w: leftW, h: areaH },
    { x: startX + leftW + gap, y: startY, w: rightW, h: halfH },
    { x: startX + leftW + gap, y: startY + halfH + gap, w: rightW, h: halfH },
    // If we somehow have fewer spots than images, just stack remaining
    { x: startX, y: startY, w: leftW * 0.48, h: areaH * 0.48 },
    { x: startX + leftW * 0.52, y: startY, w: leftW * 0.48, h: areaH * 0.48 },
  ];
}

function addClosingSlide(
  pptx: PptxGenJS,
  template: PptTemplate,
  primary: string,
  font: string
) {
  const slide = pptx.addSlide();
  slide.background = { color: primary };

  if (template.logoUrl) {
    slide.addImage({
      path: template.logoUrl,
      x: (SLIDE_W - 3) / 2,
      y: 1.2,
      w: 3,
      h: 1.5,
      sizing: { type: "contain", w: 3, h: 1.5 },
    });
  }

  slide.addText("Thank You", {
    x: MARGIN,
    y: template.logoUrl ? 3.2 : 2.0,
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
