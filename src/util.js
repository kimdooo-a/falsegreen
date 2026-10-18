// Small shared helpers. Zero dependencies on purpose.
import { createHash } from 'node:crypto';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** True when `bytes` is valid UTF-8 (strict: no replacement characters allowed). */
export function isStrictUtf8(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export const hasNonAscii = (text) => /[^\x00-\x7f]/.test(text);

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Front matter ("---\nkey: value\n---\n" at the top of a Markdown file)
// ---------------------------------------------------------------------------

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Parse simple `key: value` front matter. Values stay strings. */
export function splitFrontMatter(text) {
  const m = text.match(FM_RE);
  if (!m) return { has: false, fields: {}, order: [], raw: '', body: text };
  const fields = {};
  const order = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      fields[kv[1]] = kv[2].trim();
      order.push(kv[1]);
    }
  }
  return { has: true, fields, order, raw: m[0], body: text.slice(m[0].length) };
}

export function joinFrontMatter(fields, order, body) {
  const keys = [...order, ...Object.keys(fields).filter((k) => !order.includes(k))];
  const lines = keys.filter((k) => k in fields).map((k) => `${k}: ${fields[k]}`);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** Depth-first walk. `fn(value, key, parent, path)` for every node except the root. */
export function walkJson(node, fn, path = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      fn(v, i, node, [...path, i]);
      walkJson(v, fn, [...path, i]);
    });
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      fn(v, k, node, [...path, k]);
      walkJson(v, fn, [...path, k]);
    }
  }
}

export function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Keep the original file's indentation style when re-serialising. */
export function detectIndent(text) {
  const m = text.match(/\n([ \t]+)["\]}]/);
  return m ? m[1] : 2;
}

export function stringifyLike(value, originalText) {
  const out = JSON.stringify(value, null, detectIndent(originalText));
  return originalText.endsWith('\n') ? out + '\n' : out;
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180-ish: quotes, embedded commas, CRLF or LF)
// ---------------------------------------------------------------------------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const csvCell = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const writeCsv = (rows, eol = '\n') => rows.map((r) => r.map(csvCell).join(',')).join(eol) + eol;
export const csvEol = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

// ---------------------------------------------------------------------------
// WAV (RIFF/WAVE, PCM)
// ---------------------------------------------------------------------------

export function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, reason: 'not a RIFF/WAVE file' };
  }
  const chunks = [];
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    const end = Math.min(start + size, buf.length);
    chunks.push({ id, size, data: buf.subarray(start, end) });
    off = start + size + (size % 2);
  }
  const fmtChunk = chunks.find((c) => c.id === 'fmt ');
  const dataChunk = chunks.find((c) => c.id === 'data');
  if (!fmtChunk || !dataChunk) return { ok: false, reason: 'missing fmt or data chunk' };
  const f = fmtChunk.data;
  const fmt = {
    audioFormat: f.readUInt16LE(0),
    channels: f.readUInt16LE(2),
    sampleRate: f.readUInt32LE(4),
    blockAlign: f.readUInt16LE(12),
    bitsPerSample: f.readUInt16LE(14),
  };
  const frames = Math.floor(dataChunk.data.length / fmt.blockAlign);
  return { ok: true, chunks, fmt, data: dataChunk.data, frames, seconds: frames / fmt.sampleRate };
}

export function buildWav(chunks) {
  const parts = [];
  for (const c of chunks) {
    const head = Buffer.alloc(8);
    head.write(c.id, 0, 'ascii');
    head.writeUInt32LE(c.data.length, 4);
    parts.push(head, c.data);
    if (c.data.length % 2) parts.push(Buffer.alloc(1));
  }
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WAVE', 8, 'ascii');
  return Buffer.concat([riff, body]);
}

/** Length in seconds of trailing digital silence (16-bit PCM, |sample| <= threshold). */
export function trailingSilenceSeconds(wav, threshold = 0) {
  const { data, fmt } = wav;
  if (fmt.bitsPerSample !== 16) return 0;
  let i = data.length - 2;
  while (i >= 0 && Math.abs(data.readInt16LE(i)) <= threshold) i -= 2;
  const silentBytes = data.length - (i + 2);
  return silentBytes / fmt.blockAlign / fmt.sampleRate;
}

// ---------------------------------------------------------------------------
// SVG (regex-level; enough for mutation and for the reference guard)
// ---------------------------------------------------------------------------

export function svgViewBox(text) {
  const vb = text.match(/<svg\b[^>]*\bviewBox\s*=\s*"([^"]+)"/i);
  if (vb) {
    const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
    if ([x, y, w, h].every(Number.isFinite)) return { x, y, w, h };
  }
  const w = text.match(/<svg\b[^>]*\bwidth\s*=\s*"([\d.]+)/i);
  const h = text.match(/<svg\b[^>]*\bheight\s*=\s*"([\d.]+)/i);
  if (w && h) return { x: 0, y: 0, w: Number(w[1]), h: Number(h[1]) };
  return null;
}

export const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
};

/** All <text ...>content</text> elements with their offsets. */
export function svgTexts(text) {
  const out = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(text))) {
    const content = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({ index: m.index, end: m.index + m[0].length, open: m[1], inner: m[2], content });
  }
  return out;
}

export function textFontSize(openTag) {
  const a = attr(openTag, 'font-size');
  if (a) return parseFloat(a);
  const s = (attr(openTag, 'style') || '').match(/font-size\s*:\s*([\d.]+)/);
  return s ? parseFloat(s[1]) : 16;
}

/** Estimated bounding box of a <text>: width ≈ chars × size × 0.6. An approximation, documented as such. */
export function estimateTextBox(t) {
  const size = textFontSize(t.open);
  const x = parseFloat(attr(t.open, 'x') ?? '0');
  const y = parseFloat(attr(t.open, 'y') ?? '0');
  const width = [...t.content].length * size * 0.6;
  const anchor = attr(t.open, 'text-anchor') || 'start';
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  return { left, right: left + width, top: y - size, bottom: y + size * 0.25, size };
}
