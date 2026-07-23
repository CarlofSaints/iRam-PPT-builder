import type { TaskRow, QuestionStat, StoreVisit } from "./types";

/**
 * Merge rows into store visits.
 *
 * A Perigee form export emits one row per answer set, so a single store visit
 * (e.g. 12 damaged items at Ballito on one day) arrives as 12 rows. Building a
 * slide per row produced long runs of slides with an identical header; grouping
 * by store + date collapses them into one visit whose photos are paged across
 * slides instead.
 *
 * Task exports carry one row per store already, so this is effectively a no-op
 * for them unless the same store legitimately appears twice on the same date.
 *
 * No xlsx import here — the upload preview runs this in the browser.
 */
export function groupVisits(
  rows: TaskRow[],
  questionStats: QuestionStat[] = []
): StoreVisit[] {
  // Only choice answers make useful photo captions — free text is too long and
  // numeric values (barcodes, rand amounts) mean nothing without their label.
  const choiceQuestions = new Set(
    questionStats.filter((q) => q.kind === "choice").map((q) => q.question)
  );

  const visits = new Map<string, StoreVisit>();
  const seenUrls = new Map<string, Set<string>>();

  rows.forEach((row, i) => {
    // Rows with no store at all must not all collapse into a single visit.
    const key = row.store
      ? `${row.storeCode}|${row.store}|${row.date}`
      : `__row${i}`;

    let visit = visits.get(key);
    if (!visit) {
      visit = {
        store: row.store,
        storeCode: row.storeCode,
        channel: row.channel,
        date: row.date,
        replyStatus: row.replyStatus,
        replyBy: row.replyBy,
        replyNotes: row.replyNotes,
        rowCount: 0,
        images: [],
      };
      visits.set(key, visit);
      seenUrls.set(key, new Set());
    }

    visit.rowCount++;
    // Keep the first non-empty value for fields only some rows carry.
    if (!visit.replyBy) visit.replyBy = row.replyBy;
    if (!visit.replyNotes) visit.replyNotes = row.replyNotes;
    if (!visit.replyStatus) visit.replyStatus = row.replyStatus;

    const caption = (row.answers ?? [])
      .filter((a) => choiceQuestions.has(a.question))
      .map((a) => a.answer)
      .join(" • ");

    const urls = seenUrls.get(key)!;
    for (const url of row.images) {
      if (urls.has(url)) continue;
      urls.add(url);
      visit.images.push({ url, caption });
    }
  });

  return [...visits.values()];
}

/** How many store slides a set of visits will produce. */
export function countStoreSlides(
  visits: StoreVisit[],
  imagesPerSlide: number
): number {
  return visits.reduce((sum, v) => {
    const status = v.replyStatus.toLowerCase().trim();
    if (status && status !== "completed") return sum;
    return sum + Math.ceil(v.images.length / imagesPerSlide);
  }, 0);
}

/** Photos per store slide — shared by the builder and the upload preview. */
export const IMAGES_PER_SLIDE = 5;
