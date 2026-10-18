// Family 08 — numeric-truncation.
// Rewrite the largest numbers the way a spreadsheet displays them: 2 significant digits in
// scientific notation (2150000000 → 2.2E+09). Row count, column count and "is it a number?"
// all still pass. What is lost is concentrated in the biggest values.
import { parseCsv, writeCsv, csvEol, tryParseJson, walkJson } from '../util.js';
import { ok, no } from './_shared.js';

const PLAIN_NUM = /^-?\d+(\.\d+)?$/;
const EXP_NUM = /^-?\d+(\.\d+)?[eE][+-]?\d+$/;
const TOTAL_KEY = /total|sum|count/i;
const MIN_ABS = 1000;

/** Spreadsheet-style display: 2150000000 → "2.2E+09". */
export function spreadsheetSci(n) {
  const [m, e] = Number(n).toExponential(1).split('e');
  const exp = Number(e);
  return `${m}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

const topK = (items) => {
  const k = Math.max(1, Math.ceil(items.length * 0.1));
  return [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, k);
};

function csvPlan(ctx) {
  const rows = parseCsv(ctx.text);
  const cells = [];
  rows.forEach((r, i) => {
    if (i === 0 || TOTAL_KEY.test(r[0] ?? '')) return; // header and declared totals stay intact
    r.forEach((c, j) => {
      if (PLAIN_NUM.test(c.trim()) && Math.abs(Number(c)) >= MIN_ABS) cells.push({ i, j, value: Number(c), raw: c });
    });
  });
  return { rows, picks: topK(cells), total: cells.length };
}

function jsonPlan(ctx) {
  const p = tryParseJson(ctx.text);
  if (!p.ok) return null;
  const nums = [];
  walkJson(p.value, (v, k) => {
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) >= MIN_ABS && !(typeof k === 'string' && TOTAL_KEY.test(k))) {
      nums.push({ key: k, value: v });
    }
  });
  return { picks: topK(nums), total: nums.length };
}

export default {
  id: 'numeric-truncation',
  title: 'Numeric truncation',
  formats: ['csv', 'json'],
  summary: 'Rewrites the largest values in 2-digit scientific notation, so the biggest numbers lose the most',

  applies(ctx) {
    const plan = ctx.format === 'csv' ? csvPlan(ctx) : jsonPlan(ctx);
    if (!plan) return no('artifact is not valid JSON');
    return plan.picks.length ? ok() : no(`no numeric values >= ${MIN_ABS}`);
  },

  mutate(ctx) {
    if (ctx.format === 'csv') {
      const { rows, picks, total } = csvPlan(ctx);
      for (const p of picks) rows[p.i][p.j] = spreadsheetSci(p.value);
      const ex = picks[0];
      return {
        bytes: Buffer.from(writeCsv(rows, csvEol(ctx.text))),
        picks: picks.map((p) => ({ i: p.i, j: p.j, value: p.value })),
        note: `${ex.raw} → ${spreadsheetSci(ex.value)} (top ${picks.length} of ${total})`,
      };
    }
    // JSON: replace the literal in the raw text so formatting is preserved.
    const { picks, total } = jsonPlan(ctx);
    let text = ctx.text;
    for (const p of picks) {
      const lit = String(p.value);
      const re = new RegExp(`([:\\[,]\\s*)${lit.replace(/[.\-]/g, '\\$&')}(?=\\s*[,\\]}])`);
      text = text.replace(re, `$1${spreadsheetSci(p.value)}`);
    }
    const ex = picks[0];
    return {
      bytes: Buffer.from(text),
      picks,
      note: `${ex.value} → ${spreadsheetSci(ex.value)} (top ${picks.length} of ${total})`,
    };
  },

  verify(ctx, m) {
    const text = m.bytes.toString('utf8');
    if (ctx.format === 'csv') {
      const rows = parseCsv(text);
      const lost = m.picks.filter((p) => EXP_NUM.test(rows[p.i][p.j]) && Number(rows[p.i][p.j]) !== p.value);
      return lost.length ? ok(`${lost.length} value${lost.length === 1 ? '' : 's'} lost precision`) : no('no value lost precision');
    }
    const p = tryParseJson(text);
    if (!p.ok) return no('mutant is not valid JSON');
    const after = [];
    walkJson(p.value, (v) => typeof v === 'number' && after.push(v));
    const lost = m.picks.filter((pk) => !after.includes(pk.value));
    if (!/\d[eE][+-]\d/.test(text)) return no('no scientific notation in the mutant');
    return lost.length ? ok(`${lost.length} value${lost.length === 1 ? '' : 's'} lost precision`) : no('no value lost precision');
  },
};
