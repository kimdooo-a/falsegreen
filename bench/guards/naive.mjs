#!/usr/bin/env node
// Reference guard: NAIVE.
// What most verify steps actually check: the file exists, is not empty, and parses.
// Usage: node naive.mjs <artifact>   → exit 0 = pass, 1 = fail
import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

const path = process.argv[2];
const fail = (msg) => { console.error(`naive: ${msg}`); process.exit(1); };

if (!path || !existsSync(path)) fail('artifact missing');
const bytes = readFileSync(path);
if (bytes.length === 0) fail('artifact is empty');

switch (extname(path).toLowerCase()) {
  case '.json':
    try { JSON.parse(bytes.toString('utf8')); } catch { fail('invalid JSON'); }
    break;
  case '.svg':
    if (!bytes.toString('utf8').includes('<svg')) fail('not an SVG');
    break;
  case '.wav':
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') fail('not a WAV');
    break;
  default:
    if (!bytes.toString('utf8').trim()) fail('no text');
}
console.log('naive: ok');
