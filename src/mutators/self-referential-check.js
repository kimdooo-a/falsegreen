// Family 11 — self-referential-check.
// Point one reference in a manifest (or one Markdown link) at a file that does not exist,
// and leave every status field that vouches for it alone. A guard that asks the manifest
// ("all entries ok?") instead of the disk ("does this path exist?") stays green.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tryParseJson, walkJson } from '../util.js';
import { PATH_KEY_RE, isLocalRef, plausibleMissingName, ok, no } from './_shared.js';

const MD_LINK = /(!?\[[^\]]*\]\()([^)\s]+)(\))/g;

function jsonRefs(ctx) {
  const p = tryParseJson(ctx.text);
  if (!p.ok) return [];
  const refs = [];
  walkJson(p.value, (v, k, parent) => {
    const key = typeof k === 'string' ? k : null;
    // a string under a path-like key, or an element of an array under a path-like key
    const parentKey = Array.isArray(parent) ? null : key;
    if (typeof v === 'string' && ((parentKey && PATH_KEY_RE.test(parentKey)) || (Array.isArray(parent) && parent.__pathList))) {
      if (isLocalRef(v) && existsSync(resolve(ctx.dir, v))) refs.push(v);
    }
    if (Array.isArray(v) && key && PATH_KEY_RE.test(key)) Object.defineProperty(v, '__pathList', { value: true });
  });
  return refs;
}

function mdRefs(ctx) {
  const refs = [];
  for (const m of ctx.text.matchAll(MD_LINK)) {
    const target = m[2].split('#')[0];
    if (isLocalRef(target) && existsSync(resolve(ctx.dir, target))) refs.push(target);
  }
  return refs;
}

const refsOf = (ctx) => (ctx.format === 'json' ? jsonRefs(ctx) : mdRefs(ctx));

export default {
  id: 'self-referential-check',
  title: 'Self-referential check',
  formats: ['json', 'markdown'],
  summary: 'Points a manifest entry at a file that is not on disk while its own status fields still say ok',

  applies(ctx) {
    return refsOf(ctx).length ? ok() : no('no references to existing local files');
  },

  mutate(ctx) {
    const [ref] = refsOf(ctx);
    const missing = plausibleMissingName(ref);
    const text = ctx.format === 'json'
      ? ctx.text.replace(JSON.stringify(ref), JSON.stringify(missing))
      : ctx.text.replace(`](${ref}`, `](${missing}`);
    return { bytes: Buffer.from(text), ref, missing, note: `${ref} → ${missing.split('/').pop()} (missing)` };
  },

  verify(ctx, m) {
    if (!existsSync(resolve(ctx.dir, m.ref))) return no('original reference did not exist');
    if (existsSync(resolve(ctx.dir, m.missing))) return no(`${m.missing} exists on disk`);
    if (!m.bytes.toString('utf8').includes(m.missing)) return no('reference was not rewritten');
    if (ctx.format === 'json' && !tryParseJson(m.bytes.toString('utf8')).ok) return no('mutant is not valid JSON');
    return ok(`${m.missing} is referenced but missing from disk`);
  },
};
