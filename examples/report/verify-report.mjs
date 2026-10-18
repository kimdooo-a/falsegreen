#!/usr/bin/env node
// A realistic, hand-written guard for report.json — the kind that ships in real pipelines.
// It is not careless: it checks required fields, the item count, every item's text,
// number types, and that each attachment exists on disk. Run falsegreen on it to see
// what it still lets through.
//
// Usage: node verify-report.mjs <report.json>
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const path = process.argv[2];
const fail = (msg) => { console.error(`verify-report: ${msg}`); process.exit(1); };

let report;
try {
  report = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  fail(`cannot read report: ${e.message}`);
}

for (const key of ['title', 'generated_at', 'item_count', 'items']) {
  if (!(key in report)) fail(`missing "${key}"`);
}
if (report.item_count < 1) fail('report has no items');

for (const item of report.items) {
  if (!item.headline || !item.summary) fail(`item ${item.id} is incomplete`);
  if (typeof item.amount !== 'number') fail(`item ${item.id}: amount is not a number`);
  if (item.attachment && !existsSync(join(dirname(path), item.attachment))) fail(`missing attachment ${item.attachment}`);
}

console.log(`verify-report: ok (${report.item_count} items)`);
