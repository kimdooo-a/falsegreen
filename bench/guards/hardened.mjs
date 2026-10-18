#!/usr/bin/env node
// Reference guard: HARDENED.
// One check per failure family, written so that each one asks the artifact (or the disk)
// rather than a field that merely claims something about the artifact.
//
// Conventions this guard relies on (documented, not magic):
//   - JSON  "content_sha256" = sha256(JSON.stringify(<items>))
//   - JSON  "<x>_count"      = length of "<x>s" (or "items")
//   - JSON  "total_<f>"      = sum of items[].<f>
//   - JSON  rules with "pattern" + "examples": every example must match
//   - MD    front matter "sections" = number of "## " headings; "body_sha256" = sha256(body)
//   - CSV   a row whose first cell is TOTAL holds the column sums
//   - SVG   text width ≈ chars × font-size × 0.6 (an approximation; a production guard should
//           measure in the renderer that ships the file)
//   - SVG   fonts must come from FONTS_AVAILABLE (stand-in for the renderer's installed fonts)
//   - WAV   16-bit PCM; trailing digital silence ≤ 0.5 s
//
// Usage: node hardened.mjs <artifact>   → exit 0 = pass, 1 = fail
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, dirname, resolve } from 'node:path';

const FONTS_AVAILABLE = ['dejavu sans', 'dejavu serif', 'dejavu sans mono', 'liberation sans', 'liberation serif',
  'noto sans', 'noto serif', 'serif', 'sans-serif', 'monospace'];
const PLACEHOLDER = /lorem ipsum|\[(write|insert|enter|add)[^\]]*\]|\b(TBD|TODO|FIXME)\b|your text here/i;
const HOME_PATH = /(\/Users\/|\/home\/)[^/\s"'<]+|[A-Za-z]:\\+Users\\+[^\\\s"'<]+/;
const IDENTITY_KEYS = /^(author|creator|user|username|host|hostname|cwd|_meta|_generator)$/i;
const PATH_KEYS = /^(path|file|filename|src|href|attachment|asset|image|output)s?$/i;
const SCI = /^-?\d+(\.\d+)?[eE][+-]?\d+$/;

const path = process.argv[2];
const dir = dirname(resolve(path ?? '.'));
const problems = [];
const fail = (msg) => problems.push(msg);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

if (!path || !existsSync(path)) {
  console.error('hardened: artifact missing');
  process.exit(1);
}
const bytes = readFileSync(path);

function strictText() {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('not valid UTF-8 (declared encoding does not match the bytes)');
    return bytes.toString('utf8');
  }
}

const isLocal = (s) => typeof s === 'string' && s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith('#') && !s.startsWith('/');

// ---------------------------------------------------------------- JSON
function checkJson(text) {
  if (/[:[,]\s*-?\d+(\.\d+)?[eE][+-]?\d+/.test(text)) fail('number in scientific notation (precision lost)');
  let v;
  try { v = JSON.parse(text); } catch { return fail('invalid JSON'); }

  const walk = (node, key, parentKey) => {
    if (Array.isArray(node)) {
      if (node.length === 0) fail(`empty array${key ? ` "${key}"` : ''}`);
      node.forEach((x) => walk(x, null, key));
    } else if (node && typeof node === 'object') {
      for (const [k, x] of Object.entries(node)) {
        if (IDENTITY_KEYS.test(k)) fail(`identity metadata key "${k}"`);
        walk(x, k, key);
      }
    } else if (typeof node === 'string') {
      if (PLACEHOLDER.test(node)) fail(`placeholder text in "${key ?? parentKey}"`);
      if (HOME_PATH.test(node)) fail('home-directory path in content');
      const refKey = key ?? parentKey;
      if (refKey && PATH_KEYS.test(refKey) && isLocal(node) && !existsSync(resolve(dir, node))) fail(`referenced file not on disk: ${node}`);
    }
  };
  walk(v, null, null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return;

  if ('content_sha256' in v) {
    const covered = v.items ?? v.data ?? v.content;
    if (covered === undefined) fail('content_sha256 present but nothing to verify it against');
    else if (sha256(JSON.stringify(covered)) !== v.content_sha256) fail('content_sha256 does not match the content');
  }
  for (const [k, n] of Object.entries(v)) {
    const c = k.match(/^(\w+?)_?count$/);
    if (c && typeof n === 'number') {
      const arr = v[`${c[1]}s`] ?? v[c[1]] ?? v.items;
      if (Array.isArray(arr) && arr.length !== n) fail(`"${k}" = ${n} but the body has ${arr.length}`);
    }
    const t = k.match(/^total_(\w+)$/);
    if (t && typeof n === 'number' && Array.isArray(v.items)) {
      const sum = v.items.reduce((s, it) => s + (Number(it?.[t[1]]) || 0), 0);
      if (sum !== n) fail(`"${k}" = ${n} but items sum to ${sum}`);
    }
  }
  const rules = [];
  const findRules = (node) => {
    if (Array.isArray(node)) node.forEach(findRules);
    else if (node && typeof node === 'object') {
      if (typeof node.pattern === 'string' && Array.isArray(node.examples)) rules.push(node);
      Object.values(node).forEach(findRules);
    }
  };
  findRules(v);
  for (const r of rules) {
    let re;
    try { re = new RegExp(r.pattern, r.flags || ''); } catch { fail(`rule ${r.id ?? ''} does not compile`); continue; }
    for (const ex of r.examples) if (!re.test(ex)) fail(`rule ${r.id ?? r.pattern} does not match its own example "${ex}"`);
  }
}

// ---------------------------------------------------------------- Markdown
function checkMarkdown(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fields = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  const body = m ? text.slice(m[0].length) : text;
  for (const k of Object.keys(fields)) if (IDENTITY_KEYS.test(k)) fail(`identity metadata key "${k}"`);
  if (HOME_PATH.test(text)) fail('home-directory path in file');
  const prose = body.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!prose.length) fail('no body content');
  if (PLACEHOLDER.test(body)) fail('placeholder text in body');
  if ('sections' in fields) {
    const n = body.split('\n').filter((l) => /^##\s/.test(l)).length;
    if (Number(fields.sections) !== n) fail(`front matter says ${fields.sections} sections, body has ${n}`);
  }
  if ('body_sha256' in fields && sha256(body) !== fields.body_sha256) fail('body_sha256 does not match the body');
  for (const l of body.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = l[1].split('#')[0];
    if (isLocal(target) && !existsSync(resolve(dir, target))) fail(`link target not on disk: ${target}`);
  }
}

// ---------------------------------------------------------------- CSV
function checkCsv(text) {
  const rows = text.split(/\r?\n/).filter((l) => l.length).map((l) => {
    const out = []; let f = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(f); f = ''; } else f += c;
    }
    out.push(f); return out;
  });
  if (rows.length < 2) return fail('no data rows');
  const width = rows[0].length;
  rows.forEach((r, i) => { if (r.length !== width) fail(`row ${i + 1} has ${r.length} columns, header has ${width}`); });
  const data = rows.slice(1).filter((r) => !/^total$/i.test(r[0]));
  for (const r of data) for (const c of r) {
    if (SCI.test(c.trim())) fail(`value in scientific notation: ${c}`);
    if (PLACEHOLDER.test(c)) fail('placeholder text in a cell');
  }
  const total = rows.find((r) => /^total$/i.test(r[0]));
  if (total) total.forEach((t, j) => {
    if (j === 0 || t.trim() === '') return;
    const sum = data.reduce((s, r) => s + Number(r[j]), 0);
    if (Number(t) !== sum) fail(`TOTAL column ${rows[0][j]} = ${t} but rows sum to ${sum}`);
  });
}

// ---------------------------------------------------------------- SVG
function checkSvg(text) {
  const vbm = text.match(/<svg\b[^>]*\bviewBox\s*=\s*"([^"]+)"/i);
  const [vx, vy, vw, vh] = vbm ? vbm[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 0, 0];
  if (/<metadata>[\s\S]*?<(creator|author)\b/i.test(text) || HOME_PATH.test(text)) fail('identity in metadata');
  for (const f of text.matchAll(/font-family\s*[=:]\s*"?([^";}]+)/gi)) {
    const first = f[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    if (!FONTS_AVAILABLE.includes(first)) fail(`font "${first}" is not available to the renderer`);
  }
  const attr = (tag, n) => { const m = tag.match(new RegExp(`\\b${n}\\s*=\\s*"([^"]*)"`)); return m ? m[1] : null; };
  const elements = [...text.matchAll(/<(text|rect)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/gi)];
  const texts = [];
  if (!elements.some((e) => e[1] === 'text')) fail('no text elements');
  for (const e of elements) {
    if (e[1] === 'text') {
      const content = (e[4] || '').replace(/<[^>]+>/g, '').trim();
      if (!content) { fail('empty text element'); continue; }
      if (PLACEHOLDER.test(content)) fail(`placeholder text: "${content.slice(0, 30)}"`);
      const size = parseFloat(attr(e[2], 'font-size') || '16');
      const x = parseFloat(attr(e[2], 'x') || '0');
      const y = parseFloat(attr(e[2], 'y') || '0');
      const w = [...content].length * size * 0.6;
      const anchor = attr(e[2], 'text-anchor') || 'start';
      const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      const box = { l: left, r: left + w, t: y - size, b: y + size * 0.25 };
      if (vbm && (box.l < vx || box.r > vx + vw || box.t < vy || box.b > vy + vh)) fail(`text overflows the canvas: "${content.slice(0, 24)}"`);
      texts.push({ box, content });
    } else {
      // A rect drawn AFTER a text element is above it. If it is opaque and covers the text, the text is hidden.
      const fill = attr(e[2], 'fill');
      const op = Number(attr(e[2], 'opacity') ?? attr(e[2], 'fill-opacity') ?? '1');
      if (fill === 'none' || op < 1) continue;
      const r = { l: +attr(e[2], 'x') || 0, t: +attr(e[2], 'y') || 0 };
      r.r = r.l + (+attr(e[2], 'width') || 0); r.b = r.t + (+attr(e[2], 'height') || 0);
      for (const t of texts) {
        const ix = Math.max(0, Math.min(r.r, t.box.r) - Math.max(r.l, t.box.l));
        const iy = Math.max(0, Math.min(r.b, t.box.b) - Math.max(r.t, t.box.t));
        const area = (t.box.r - t.box.l) * (t.box.b - t.box.t);
        if (area > 0 && (ix * iy) / area >= 0.12) fail(`text "${t.content.slice(0, 24)}" is covered by a later opaque shape`);
      }
    }
  }
}

// ---------------------------------------------------------------- WAV
function checkWav() {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return fail('not a WAV');
  let off = 12; let fmt = null; let data = null;
  while (off + 8 <= bytes.length) {
    const id = bytes.toString('ascii', off, off + 4);
    const size = bytes.readUInt32LE(off + 4);
    const body = bytes.subarray(off + 8, off + 8 + size);
    if (id === 'fmt ') fmt = { rate: body.readUInt32LE(4), align: body.readUInt16LE(12), bits: body.readUInt16LE(14) };
    if (id === 'data') data = body;
    if (id === 'LIST' && /IART|IENG/.test(body.toString('latin1'))) fail('author metadata in LIST/INFO');
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) return fail('missing fmt or data chunk');
  if (fmt.bits !== 16) return fail('only 16-bit PCM is checked');
  const n = data.length / 2;
  if (n === 0) return fail('no audio frames');
  let sq = 0;
  for (let i = 0; i < data.length; i += 2) sq += (data.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(sq / n) < 0.01) fail('audio is silent');
  let i = data.length - 2;
  while (i >= 0 && data.readInt16LE(i) === 0) i -= 2;
  const tail = (data.length - (i + 2)) / fmt.align / fmt.rate;
  if (tail > 0.5) fail(`${tail.toFixed(2)} s of trailing digital silence`);
}

// ---------------------------------------------------------------- text
function checkText(text) {
  if (!text.trim()) return fail('empty');
  if (PLACEHOLDER.test(text)) fail('placeholder text');
}

const ext = extname(path).toLowerCase();
if (bytes.length === 0) fail('artifact is empty');
else if (ext === '.wav') checkWav();
else {
  const text = strictText();
  if (ext === '.json') checkJson(text);
  else if (ext === '.md' || ext === '.markdown') checkMarkdown(text);
  else if (ext === '.csv') checkCsv(text);
  else if (ext === '.svg') checkSvg(text);
  else checkText(text);
}

if (problems.length) {
  console.error(`hardened: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of [...new Set(problems)].slice(0, 5)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('hardened: ok');
