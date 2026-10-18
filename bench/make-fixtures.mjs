#!/usr/bin/env node
// Regenerates every bench fixture and the demo artifact from source, so derived values
// (digests, totals, the WAV signal) are computed rather than typed by hand.
// Usage: node bench/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'bench', 'fixtures');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const put = (rel, content) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const fixture = (family, artifact, content, expect, extra = {}) => {
  put(join('bench', 'fixtures', family, artifact), content);
  put(join('bench', 'fixtures', family, 'expected.json'), json({ family, artifact, expect, ...extra }));
};
const BOTH = { naive: 'FALSE_GREEN', hardened: 'CAUGHT' };

const slide = (lines, font = 'DejaVu Sans') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect x="0" y="0" width="800" height="450" fill="#0f172a"/>
${lines.map(([y, size, color, text]) => `  <text x="60" y="${y}" font-family="${font}" font-size="${size}" fill="${color}">${text}</text>`).join('\n')}
  <rect x="60" y="300" width="240" height="6" fill="#22c55e"/>
</svg>
`;

// 01 empty-input
fixture('empty-input', 'answers.json', json({
  generated_at: '2026-10-18T09:00:00Z',
  items: [
    { id: 'q-101', question: 'Which regions reported outages this week?', answer: 'Two regions reported short outages; both recovered within an hour.' },
    { id: 'q-102', question: 'Did the nightly export finish on time?', answer: 'Yes, every nightly export finished before the 06:00 deadline.' },
    { id: 'q-103', question: 'Were any customer tickets escalated?', answer: 'One ticket was escalated and resolved by the on-call engineer.' },
  ],
}), BOTH);

// 02 placeholder-as-content
fixture('placeholder-as-content', 'summary.md', `---
title: Quarterly summary
---

# Quarterly summary

## Highlights

Revenue grew in every region, led by the northern sales team.

Support response times fell below four hours for the first time.

## Risks

Two vendor contracts expire next quarter and need renewal.
`, BOTH);

// 03 occlusion
fixture('occlusion', 'slide.svg', slide([
  [140, 44, '#f8fafc', 'Release 2.4 is ready'],
  [200, 24, '#cbd5e1', 'All checks passed on the staging cluster'],
]), BOTH);

// 04 overflow
fixture('overflow', 'title-card.svg', slide([
  [140, 40, '#f8fafc', 'Quarterly results'],
  [200, 22, '#cbd5e1', 'Prepared for the board meeting on Friday'],
]), BOTH);

// 05 declared-vs-rendered
fixture('declared-vs-rendered', 'poster.svg', slide([
  [140, 40, '#f8fafc', 'Open house'],
  [200, 22, '#cbd5e1', 'Saturday from ten until four'],
], 'DejaVu Serif'), BOTH);

// 06 metadata-identity
fixture('metadata-identity', 'badge.svg', slide([
  [140, 40, '#f8fafc', 'Entry 0427'],
  [200, 22, '#cbd5e1', 'Blind review copy'],
]), BOTH);

// 07 stale-cache
const catalog = [
  { sku: 'lamp-01', name: 'Desk lamp with a warm dimmer', price: 4900 },
  { sku: 'chair-07', name: 'Folding chair in recycled oak', price: 12900 },
  { sku: 'mug-12', name: 'Stoneware mug, glazed by hand', price: 1800 },
];
fixture('stale-cache', 'catalog.json', json({
  built_at: '2026-10-18T09:00:00Z',
  content_sha256: sha256(JSON.stringify(catalog)),
  items: catalog,
}), BOTH);

// 08 numeric-truncation
const ledger = [
  ['inv-001', 'Northwind Traders', 2150000000],
  ['inv-002', 'Blue Harbor Foods', 48250000],
  ['inv-003', 'Cedar and Pine Ltd', 7300000],
  ['inv-004', 'Atlas Freight Co', 915000],
  ['inv-005', 'Morning Star Bakery', 482300],
  ['inv-006', 'Riverbend Clinic', 361900],
  ['inv-007', 'Copper Kettle Inn', 129750],
  ['inv-008', 'Lighthouse Books', 87400],
  ['inv-009', 'Granite Peak Gear', 45210],
  ['inv-010', 'Willow Lane Florist', 12800],
];
const total = ledger.reduce((s, r) => s + r[2], 0);
fixture('numeric-truncation', 'ledger.csv',
  ['id,customer,amount', ...ledger.map((r) => r.join(',')), `TOTAL,,${total}`].join('\n') + '\n', BOTH);

// 09 dead-regex
fixture('dead-regex', 'rules.json', json({
  version: 3,
  rules: [
    { id: 'dessert-mention', pattern: 'café|crème brûlée', flags: 'i', examples: ['Meet me at the café', 'Crème brûlée for dessert'] },
    { id: 'refund-request', pattern: 'refund|money back', flags: 'i', examples: ['I want a refund please', 'Can I get my money back?'] },
  ],
}), BOTH);

// 10 silent-track — 2.0 s, 22.05 kHz, mono, 16-bit, a gently enveloped 220 Hz tone
{
  const rate = 22050;
  const n = rate * 2;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 400, (n - i) / 400);
    const s = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * Math.max(env, 0.02);
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunk = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'ascii'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b]); };
  const body = Buffer.concat([chunk('fmt ', fmt), chunk('data', data)]);
  const riff = Buffer.alloc(12); riff.write('RIFF', 0, 'ascii'); riff.writeUInt32LE(body.length + 4, 4); riff.write('WAVE', 8, 'ascii');
  fixture('silent-track', 'narration.wav', Buffer.concat([riff, body]), BOTH);
}

// 11 self-referential-check
const icon = (label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40"><text x="8" y="26" font-family="DejaVu Sans" font-size="16">${label}</text></svg>\n`;
put('bench/fixtures/self-referential-check/assets/cover.svg', icon('cover'));
put('bench/fixtures/self-referential-check/assets/chart.svg', icon('chart'));
fixture('self-referential-check', 'manifest.json', json({
  release: '2026.10',
  status: 'complete',
  files: [
    { path: 'assets/cover.svg', exists: true, checked: true },
    { path: 'assets/chart.svg', exists: true, checked: true },
  ],
}), BOTH);

// 12 structured-overrides-body
fixture('structured-overrides-body', 'field-report.md', `---
title: Field report
sections: 4
---

# Field report

## Context

The pilot ran in three clinics over six weeks with the same intake form.

## Method

Staff logged every visit and we compared waiting times with the previous quarter.

## Findings

Median waiting time fell from forty minutes to twenty six minutes.

## Next steps

Extend the pilot to two rural clinics before the end of the year.
`, BOTH);

// ---------------------------------------------------------------- demo artifact
const items = [
  { id: 'd-01', headline: 'Port volumes recover after the strike', summary: 'Container throughput returned to its seasonal average within nine days.', amount: 2150000000, attachment: 'charts/ports.svg' },
  { id: 'd-02', headline: 'Café chains raise prices again', summary: 'Three national chains added between four and seven percent to menu prices.', amount: 96300000, attachment: 'charts/cafes.svg' },
  { id: 'd-03', headline: 'Rail freight bookings flatten', summary: 'Bookings held steady for a fourth week as fuel costs stabilised.', amount: 17250000, attachment: 'charts/rail.svg' },
];
put('examples/report/report.json', json({
  title: 'Weekly market digest — São Paulo and Zürich desks',
  generated_at: '2026-10-18T09:00:00Z',
  item_count: items.length,
  total_amount: items.reduce((s, i) => s + i.amount, 0),
  content_sha256: sha256(JSON.stringify(items)),
  items,
}));
for (const [f, label] of [['ports', 'Port volumes'], ['cafes', 'Café prices'], ['rail', 'Rail freight']]) {
  put(`examples/report/charts/${f}.svg`, icon(label));
}

console.log(`fixtures written under ${FIX.replace(ROOT, '.')}`);
