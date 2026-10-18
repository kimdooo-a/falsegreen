// Family 12 — structured-overrides-body.
// Shrink the body and leave the structured summary that describes it untouched
// ("item_count": 3 over a single item; "sections: 4" over two sections). A guard that reads
// the summary field instead of the body it summarizes passes.
import { splitFrontMatter, joinFrontMatter, tryParseJson, stringifyLike } from '../util.js';
import { COUNT_KEY_RE, ok, no } from './_shared.js';

function jsonPlan(ctx) {
  const p = tryParseJson(ctx.text);
  if (!p.ok || !p.value || typeof p.value !== 'object' || Array.isArray(p.value)) return null;
  const v = p.value;
  for (const k of Object.keys(v)) {
    const m = k.match(COUNT_KEY_RE);
    if (!m || typeof v[k] !== 'number') continue;
    const stem = m[1].replace(/_$/, '');
    const arrayKey = [`${stem}s`, stem, 'items'].find((a) => Array.isArray(v[a]) && v[a].length === v[k]);
    if (arrayKey && v[arrayKey].length >= 2) return { value: v, countKey: k, arrayKey };
  }
  return null;
}

const SECTION = /^##\s/;
const sectionCount = (body) => body.split('\n').filter((l) => SECTION.test(l)).length;
const wordCount = (body) => (body.replace(/^#.*$/gm, '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

function mdPlan(ctx) {
  const fm = splitFrontMatter(ctx.text);
  if (!fm.has) return null;
  const sections = Number(fm.fields.sections);
  if (Number.isInteger(sections) && sections >= 2 && sections === sectionCount(fm.body)) return { fm, field: 'sections' };
  const words = Number(fm.fields.word_count);
  if (Number.isFinite(words) && words > 0 && Math.abs(words - wordCount(fm.body)) <= words * 0.1) return { fm, field: 'word_count' };
  return null;
}

/** Keep the first half of the "## " sections (or paragraphs). */
function halveBody(body, field) {
  const lines = body.split('\n');
  if (field === 'sections') {
    const starts = lines.map((l, i) => (SECTION.test(l) ? i : -1)).filter((i) => i >= 0);
    const keep = Math.max(1, Math.floor(starts.length / 2));
    return lines.slice(0, starts[keep]).join('\n').replace(/\s*$/, '\n');
  }
  const paras = body.split(/\n\s*\n/);
  return paras.slice(0, Math.max(1, Math.floor(paras.length / 2))).join('\n\n').replace(/\s*$/, '\n');
}

export default {
  id: 'structured-overrides-body',
  title: 'Structured field overrides body',
  formats: ['json', 'markdown'],
  summary: 'Cuts the body but keeps the summary field (count, sections, word_count) that vouches for it',

  applies(ctx) {
    const plan = ctx.format === 'json' ? jsonPlan(ctx) : mdPlan(ctx);
    return plan ? ok() : no(ctx.format === 'json'
      ? 'no *_count field matching an array of 2+ items'
      : 'no front-matter sections/word_count that matches the body');
  },

  mutate(ctx) {
    if (ctx.format === 'json') {
      const { value, countKey, arrayKey } = jsonPlan(ctx);
      const n = value[arrayKey].length;
      value[arrayKey] = value[arrayKey].slice(0, 1);
      return { bytes: Buffer.from(stringifyLike(value, ctx.text)), countKey, arrayKey, note: `${arrayKey}: ${n} → 1 entries; "${countKey}" still says ${n}` };
    }
    const { fm, field } = mdPlan(ctx);
    const body = halveBody(fm.body, field);
    const now = field === 'sections' ? sectionCount(body) : wordCount(body);
    return { bytes: Buffer.from(joinFrontMatter(fm.fields, fm.order, body)), field, note: `body cut to ${now} ${field === 'sections' ? 'sections' : 'words'}; "${field}" still says ${fm.fields[field]}` };
  },

  verify(ctx, m) {
    const text = m.bytes.toString('utf8');
    if (ctx.format === 'json') {
      const v = JSON.parse(text);
      return v[m.countKey] !== v[m.arrayKey].length
        ? ok(`"${m.countKey}" = ${v[m.countKey]} but ${m.arrayKey} has ${v[m.arrayKey].length}`)
        : no('summary still matches the body');
    }
    const fm = splitFrontMatter(text);
    const claimed = Number(fm.fields[m.field]);
    const actual = m.field === 'sections' ? sectionCount(fm.body) : wordCount(fm.body);
    const off = m.field === 'sections' ? claimed !== actual : Math.abs(claimed - actual) > claimed * 0.1;
    return off ? ok(`"${m.field}" = ${claimed} but the body has ${actual}`) : no('summary still matches the body');
  },
};
