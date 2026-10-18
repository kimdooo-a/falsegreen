// Family 02 — placeholder-as-content.
// Replace real content with template text of the same length. Every "is it empty?" check passes,
// because a placeholder is text.
import { parseCsv, writeCsv, csvEol, splitFrontMatter, tryParseJson, stringifyLike, walkJson, svgTexts } from '../util.js';
import { fillLike, isProse, PLACEHOLDER_RE, pct, ok, no } from './_shared.js';

const SKIP_KEYS = /^(pattern|regex|regexp|re|flags|id|path|file|src|href|url)$/i;

function markdownSegments(body) {
  // Returns [{ lineIndex, prefix, text }] for prose lines outside code fences.
  const lines = body.split('\n');
  const out = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced || /^\s*(#|\||!\[|<|>?\s*$)/.test(line)) return;
    const m = line.match(/^(\s*(?:[-*+]|\d+\.)\s+|\s*>\s*)?(.*?)(\r?)$/);
    if (isProse(m[2])) out.push({ lineIndex: i, prefix: m[1] || '', text: m[2], cr: m[3] });
  });
  return { lines, segments: out };
}

function plan(ctx) {
  switch (ctx.format) {
    case 'text': {
      const lines = ctx.text.split('\n');
      const idx = lines.map((l, i) => (isProse(l.replace(/\r$/, '')) ? i : -1)).filter((i) => i >= 0);
      return { count: idx.length, apply() {
        const originals = [];
        for (const i of idx) {
          const cr = lines[i].endsWith('\r') ? '\r' : '';
          const t = lines[i].replace(/\r$/, '');
          originals.push(t);
          lines[i] = fillLike(t) + cr;
        }
        return { text: lines.join('\n'), originals };
      } };
    }
    case 'markdown': {
      const fm = splitFrontMatter(ctx.text);
      const { lines, segments } = markdownSegments(fm.body);
      return { count: segments.length, apply() {
        for (const s of segments) lines[s.lineIndex] = s.prefix + fillLike(s.text) + s.cr;
        return { text: fm.raw + lines.join('\n'), originals: segments.map((s) => s.text) };
      } };
    }
    case 'json': {
      const parsed = tryParseJson(ctx.text);
      if (!parsed.ok) return { count: 0, why: 'artifact is not valid JSON' };
      const targets = [];
      walkJson(parsed.value, (v, k, parent) => {
        if (typeof k === 'string' && SKIP_KEYS.test(k)) return;
        if (isProse(v)) targets.push({ k, parent });
      });
      return { count: targets.length, apply() {
        const originals = targets.map((t) => t.parent[t.k]);
        for (const t of targets) t.parent[t.k] = fillLike(t.parent[t.k]);
        return { text: stringifyLike(parsed.value, ctx.text), originals };
      } };
    }
    case 'csv': {
      const rows = parseCsv(ctx.text);
      const cells = [];
      rows.forEach((r, i) => i > 0 && r.forEach((c, j) => isProse(c, 8) && cells.push([i, j])));
      return { count: cells.length, apply() {
        const originals = cells.map(([i, j]) => rows[i][j]);
        for (const [i, j] of cells) rows[i][j] = fillLike(rows[i][j]);
        return { text: writeCsv(rows, csvEol(ctx.text)), originals };
      } };
    }
    case 'svg': {
      const texts = svgTexts(ctx.text).filter((t) => t.content.length >= 4 && !/<tspan/i.test(t.inner));
      return { count: texts.length, apply() {
        let out = ctx.text;
        for (const t of [...texts].reverse()) {
          const start = t.index + t.open.length + '<text>'.length;
          out = out.slice(0, start) + fillLike(t.inner.trim()) + out.slice(t.end - '</text>'.length);
        }
        return { text: out, originals: texts.map((t) => t.content) };
      } };
    }
    default:
      return { count: 0, why: `unsupported format ${ctx.format}` };
  }
}

export default {
  id: 'placeholder-as-content',
  title: 'Placeholder as content',
  formats: ['text', 'markdown', 'json', 'csv', 'svg'],
  summary: 'Swaps real prose for same-length template text ("Lorem ipsum", "[Write ... here]")',
  applies(ctx) {
    const p = plan(ctx);
    return p.count > 0 ? ok() : no(p.why || 'no prose content to replace');
  },
  mutate(ctx) {
    const p = plan(ctx);
    const { text, originals } = p.apply();
    const bytes = Buffer.from(text, 'utf8');
    return {
      bytes,
      originals,
      note: `${originals.length} field${originals.length === 1 ? '' : 's'} → template text, size ${pct(ctx.bytes.length, bytes.length)}`,
    };
  },
  verify(ctx, m) {
    const text = m.bytes.toString('utf8');
    if (!PLACEHOLDER_RE.test(text)) return no('no placeholder text found in the mutant');
    const gone = m.originals.filter((o) => !text.includes(o)).length;
    if (gone === 0) return no('original content still present');
    const ratio = m.bytes.length / ctx.bytes.length;
    if (ratio < 0.85 || ratio > 1.15) return no(`size changed too much (${pct(ctx.bytes.length, m.bytes.length)})`);
    return ok(`${gone} field${gone === 1 ? '' : 's'} replaced by placeholder text`);
  },
};
