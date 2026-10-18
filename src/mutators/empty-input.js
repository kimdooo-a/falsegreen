// Family 01 — empty-input.
// Hand the guard a structurally valid artifact with nothing in it. A guard that checks
// "every item is valid" passes vacuously when there are no items.
import { parseCsv, writeCsv, csvEol, splitFrontMatter, tryParseJson, stringifyLike, walkJson, parseWav, buildWav } from '../util.js';
import { ok, no } from './_shared.js';

function countArrays(v) {
  let arrays = 0;
  let elements = 0;
  const visit = (x) => { if (Array.isArray(x)) { arrays++; elements += x.length; } };
  visit(v);
  walkJson(v, visit);
  return { arrays, elements };
}

const emptyArrays = (v) => {
  if (Array.isArray(v)) return [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptyArrays(x)]));
  return v;
};

const isHeading = (l) => /^\s*#{1,6}\s/.test(l);
const svgRoot = (t) => t.match(/<svg\b[^>]*>/i);

export default {
  id: 'empty-input',
  title: 'Empty input',
  formats: ['text', 'markdown', 'json', 'csv', 'svg', 'wav'],
  summary: 'Keeps the structure, removes the content: [] items, header-only CSV, 0 audio frames',

  applies(ctx) {
    switch (ctx.format) {
      case 'json': {
        const p = tryParseJson(ctx.text);
        if (!p.ok) return no('artifact is not valid JSON');
        return countArrays(p.value).elements > 0 ? ok() : no('no non-empty arrays to empty');
      }
      case 'csv': return parseCsv(ctx.text).length >= 2 ? ok() : no('no data rows');
      case 'markdown': {
        const body = splitFrontMatter(ctx.text).body;
        return body.split('\n').some((l) => l.trim() && !isHeading(l)) ? ok() : no('no body content');
      }
      case 'text': return ctx.text.trim() ? ok() : no('already empty');
      case 'svg': {
        const root = svgRoot(ctx.text);
        if (!root) return no('no <svg> root element');
        const inner = ctx.text.slice(root.index + root[0].length, ctx.text.lastIndexOf('</svg>'));
        return inner.trim() ? ok() : no('svg is already empty');
      }
      case 'wav': {
        const w = parseWav(ctx.bytes);
        if (!w.ok) return no(w.reason);
        return w.frames > 0 ? ok() : no('no audio frames');
      }
      default: return no(`unsupported format ${ctx.format}`);
    }
  },

  mutate(ctx) {
    switch (ctx.format) {
      case 'json': {
        const v = JSON.parse(ctx.text);
        const { arrays, elements } = countArrays(v);
        const text = stringifyLike(emptyArrays(v), ctx.text);
        return { bytes: Buffer.from(text), note: `${elements} element${elements === 1 ? '' : 's'} in ${arrays} array${arrays === 1 ? '' : 's'} → []; every key kept` };
      }
      case 'csv': {
        const rows = parseCsv(ctx.text);
        return { bytes: Buffer.from(writeCsv([rows[0]], csvEol(ctx.text))), note: `header kept, ${rows.length - 1} data rows dropped` };
      }
      case 'markdown': {
        const fm = splitFrontMatter(ctx.text);
        const lines = fm.body.split('\n');
        const kept = lines.filter((l) => isHeading(l) || !l.trim());
        const dropped = lines.length - kept.length;
        return { bytes: Buffer.from(fm.raw + kept.join('\n').replace(/\n{3,}/g, '\n\n')), note: `headings kept, ${dropped} body lines dropped` };
      }
      case 'text':
        return { bytes: Buffer.alloc(0), note: 'file emptied (0 bytes)' };
      case 'svg': {
        const root = svgRoot(ctx.text);
        const close = ctx.text.lastIndexOf('</svg>');
        const text = ctx.text.slice(0, root.index + root[0].length) + ctx.text.slice(close);
        return { bytes: Buffer.from(text), note: '<svg> root kept, every child element removed' };
      }
      case 'wav': {
        const w = parseWav(ctx.bytes);
        const chunks = w.chunks.map((c) => (c.id === 'data' ? { id: 'data', data: Buffer.alloc(0) } : c));
        return { bytes: buildWav(chunks), note: `header intact, ${w.frames} audio frames → 0` };
      }
      default: throw new Error(`unsupported format ${ctx.format}`);
    }
  },

  verify(ctx, m) {
    const text = m.bytes.toString('utf8');
    switch (ctx.format) {
      case 'json': {
        const p = tryParseJson(text);
        if (!p.ok) return no('mutant is not valid JSON');
        return countArrays(p.value).elements === 0 ? ok('valid JSON with every array empty') : no('arrays still have elements');
      }
      case 'csv': return parseCsv(text).length === 1 ? ok('header-only CSV') : no('data rows remain');
      case 'markdown': {
        const body = splitFrontMatter(text).body;
        return body.split('\n').every((l) => !l.trim() || isHeading(l)) ? ok('headings with no body') : no('body content remains');
      }
      case 'text': return text.trim() === '' ? ok('empty file') : no('content remains');
      case 'svg': return /<svg\b/i.test(text) && !/<(text|rect|path|circle|g|image)\b/i.test(text) ? ok('empty <svg> root') : no('child elements remain');
      case 'wav': {
        const w = parseWav(m.bytes);
        return w.ok && w.frames === 0 ? ok('valid WAV with 0 frames') : no('audio frames remain or header broken');
      }
      default: return no('unsupported');
    }
  },
};
