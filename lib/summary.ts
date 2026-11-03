import { groupVisits } from "./visits";
import type { ParsedData } from "./types";

export interface RepSummaryRow {
  rep: string;
  uniqueStores: number;
  totalVisits: number;
  pictures: number;
}

export interface StoreSummaryRow {
  storeCode: string;
  store: string;
  channel: string;
  uniqueReps: number;
  totalVisits: number;
  pictures: number;
}

/**
 * Excel summary counts, by rep and by store. Built from the same visit grouping
 * as the deck, so "visits" and "pictures" match the slides. Task rows with an
 * explicit non-completed status are not visits (nobody went), same as the deck.
 */
export function summarise(data: ParsedData): { byRep: RepSummaryRow[]; byStore: StoreSummaryRow[] } {
  const visits = groupVisits(data.rows, data.questionStats ?? []).filter((v) => {
    const s = v.replyStatus.toLowerCase().trim();
    return !s || s === "completed";
  });

  const reps = new Map<string, { stores: Set<string>; visits: number; pictures: number }>();
  const stores = new Map<string, StoreSummaryRow & { reps: Set<string> }>();

  for (const v of visits) {
    const rep = v.replyBy || "(no rep)";
    const storeKey = `${v.storeCode}|${v.store}`;

    const r = reps.get(rep) ?? { stores: new Set(), visits: 0, pictures: 0 };
    r.stores.add(storeKey);
    r.visits++;
    r.pictures += v.images.length;
    reps.set(rep, r);

    const s = stores.get(storeKey) ?? {
      storeCode: v.storeCode, store: v.store, channel: v.channel,
      uniqueReps: 0, totalVisits: 0, pictures: 0, reps: new Set<string>(),
    };
    s.reps.add(rep);
    s.totalVisits++;
    s.pictures += v.images.length;
    stores.set(storeKey, s);
  }

  const byRep = [...reps].map(([rep, r]) => ({
    rep, uniqueStores: r.stores.size, totalVisits: r.visits, pictures: r.pictures,
  })).sort((a, b) => a.rep.localeCompare(b.rep));

  const byStore = [...stores.values()].map(({ reps: rs, ...s }) => ({ ...s, uniqueReps: rs.size }))
    .sort((a, b) => a.store.localeCompare(b.store));

  return { byRep, byStore };
}
