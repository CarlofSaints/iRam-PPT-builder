// Self-check: a Field Goose FORM export gets a rep name + date per row, and the
// Excel summary totals agree with the deck's own counts.
// Run: npx tsx scripts/check-summary.ts <forms_exportresponses_fieldgoose-*.xlsx>
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseExcel } from '../lib/parseExcel';
import { summarise } from '../lib/summary';

const d = parseExcel(readFileSync(process.argv[2]));
assert.ok(d.rows.every((r) => r.replyBy), 'a row has no rep');
assert.ok(d.rows.every((r) => /^\d{2} [A-Z][a-z]{2} \d{4}$/.test(r.date)), `bad date: ${d.rows[0].date}`);

const { byRep, byStore } = summarise(d);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
assert.equal(sum(byRep, (r) => r.totalVisits), d.deckSummary.totalVisits);
assert.equal(sum(byStore, (r) => r.totalVisits), d.deckSummary.totalVisits);
assert.equal(sum(byRep, (r) => r.pictures), sum(byStore, (r) => r.pictures));
assert.equal(byStore.length, d.deckSummary.uniqueSites);
console.log('OK', { reps: byRep.length, stores: byStore.length, firstRow: d.rows[0].replyBy + ' / ' + d.rows[0].date });

// Two reps at the same store on the same day: each gets the visit.
const twin = { ...d.rows[0], replyBy: 'Second Rep', images: ['https://x/1'] };
const two = summarise({ ...d, rows: [d.rows[0], twin] });
assert.equal(two.byRep.length, 2, 'second rep lost');
assert.equal(two.byStore[0].uniqueReps, 2);
assert.equal(two.byStore[0].totalVisits, 2);
console.log('OK two reps, one store');
