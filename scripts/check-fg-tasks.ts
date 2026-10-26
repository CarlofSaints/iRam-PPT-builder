// Self-check: a Field Goose task export gets a date and no metadata-as-questions,
// also through a template saved against Perigee header names.
// Run: npx tsx scripts/check-fg-tasks.ts <tasks_downloadtaskresponses_fieldgoose-*.xlsx>
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseExcel } from '../lib/parseExcel';
const tasks = readFileSync(process.argv[2]);
const t = parseExcel(tasks);
assert.ok(t.rows[0].date, 'no date'); assert.equal(t.questionStats.length, 0);
const m = parseExcel(tasks, { title: 'Title', store: 'Store', date: 'Reply Date', imageColumns: ['Image 1'] });
assert.ok(m.rows[0].date, 'template lost the date');
console.log('OK');
