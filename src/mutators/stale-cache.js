// Family 07 — stale-cache.
// The label stays the same while the content behind it changes. Anything that trusts
// the key (a digest, an ETag, a version) instead of recomputing it serves stale content.
import { splitFrontMatter, joinFrontMatter, tryParseJson, stringifyLike, walkJson } from '../util.js';
import { DIGEST_KEY_RE, isProse, ok, no } from './_shared.js';

const CONTENT_KEYS = ['items', 'data', 'content', 'body', 'entries', 'records', 'results'];

function jsonPlan(ctx) {
  const p = tryParseJson(ctx.text);
  if (!p.ok || !p.value || typeof p.value !== 'object' || Array.isArray(p.value)) return null;
  const digestKey = Object.keys(p.value).find((k) => DIGEST_KEY_RE.test(k) && typeof p.value[k] === 'string');
  if (!digestKey) return null;
  const contentKey = CONTENT_KEYS.find((k) => k in p.value) ??
    Object.keys(p.value).find((k) => k !== digestKey && typeof p.value[k] === 'object' && p.value[k]);
  if (!contentKey) return null;
  return { value: p.value, digestKey, contentKey };
}

function changeOneValue(node) {
  // Edit the first prose string; otherwise bump the first number. Returns a description or null.
  let done = null;
  walkJson(node, (v, k, parent) => {
    if (done || !isProse(v, 8)) return;
    parent[k] = `${v} (revised)`;
    done = `"${String(k)}" edited`;
  });
  if (done) return done;
  walkJson(node, (v, k, parent) => {
    if (done || typeof v !== 'number') return;
    parent[k] = v + 1;
    done = `"${String(k)}" ${v}→${v + 1}`;
  });
  return done;
}

function mdPlan(ctx) {
  const fm = splitFrontMatter(ctx.text);
  if (!fm.has) return null;
  const digestKey = fm.order.find((k) => DIGEST_KEY_RE.test(k));
  return digestKey ? { fm, digestKey } : null;
}

export default {
  id: 'stale-cache',
  title: 'Stale cache',
  formats: ['json', 'markdown'],
  summary: 'Changes the content but keeps its digest/ETag/version, so the label says nothing changed',

  applies(ctx) {
    const plan = ctx.format === 'json' ? jsonPlan(ctx) : mdPlan(ctx);
    return plan ? ok() : no('no digest/etag/checksum field to keep stale');
  },

  mutate(ctx) {
    if (ctx.format === 'json') {
      const { value, digestKey, contentKey } = jsonPlan(ctx);
      const what = changeOneValue(value[contentKey]);
      if (!what) return { bytes: ctx.bytes, note: 'nothing editable', digestKey };
      return { bytes: Buffer.from(stringifyLike(value, ctx.text)), digestKey, contentKey, note: `${contentKey} edited; ${digestKey} kept` };
    }
    const { fm, digestKey } = mdPlan(ctx);
    const lines = fm.body.split('\n');
    const i = lines.findIndex((l) => isProse(l) && !/^\s*#/.test(l));
    if (i < 0) return { bytes: ctx.bytes, note: 'no prose line to edit', digestKey };
    lines[i] = lines[i].replace(/(\r?)$/, ' (revised)$1');
    return { bytes: Buffer.from(joinFrontMatter(fm.fields, fm.order, lines.join('\n'))), digestKey, note: `body edited; ${digestKey} kept` };
  },

  verify(ctx, m) {
    const text = m.bytes.toString('utf8');
    if (ctx.format === 'json') {
      const a = JSON.parse(ctx.text);
      const b = JSON.parse(text);
      if (a[m.digestKey] !== b[m.digestKey]) return no('digest field changed');
      if (JSON.stringify(a[m.contentKey]) === JSON.stringify(b[m.contentKey])) return no('content did not change');
      return ok(`content differs while "${m.digestKey}" still claims the old value`);
    }
    const a = splitFrontMatter(ctx.text);
    const b = splitFrontMatter(text);
    if (a.fields[m.digestKey] !== b.fields[m.digestKey]) return no('digest field changed');
    if (a.body === b.body) return no('body did not change');
    return ok(`body differs while "${m.digestKey}" still claims the old value`);
  },
};
