// Family 09 — dead-regex.
// The artifact here is a rules file a pipeline loads (patterns + examples). Wrap each pattern
// in \b...\b. That looks like tightening; for a pattern that ends in a non-ASCII letter it is
// death: JavaScript's \b only knows [A-Za-z0-9_], so there is never a boundary after "é" or "한".
// ASCII-only patterns get ^...$ anchors instead, which kills them inside sentences.
import { tryParseJson, stringifyLike, walkJson, hasNonAscii } from '../util.js';
import { ok, no } from './_shared.js';

const PATTERN_KEY = /^(pattern|regex|regexp|re|match)$/i;
const EXAMPLE_KEYS = ['examples', 'samples', 'should_match', 'positives'];

const compile = (src, flags = '') => { try { return new RegExp(src, flags); } catch { return null; } };

/** Probes: the rule's own examples if it has any, else each top-level alternative as a word in a sentence. */
function probesFor(rule, pattern) {
  for (const k of EXAMPLE_KEYS) if (Array.isArray(rule[k]) && rule[k].length) return rule[k].map(String);
  if (/[()[\]]/.test(pattern)) return [];
  return pattern.split('|').map((alt) => `see ${alt.replace(/\\(.)/g, '$1').replace(/[\^$.*+?{}]/g, '')} here`);
}

function findRules(value) {
  const rules = [];
  const visit = (v, k, parent) => {
    if (typeof k === 'string' && PATTERN_KEY.test(k) && typeof v === 'string' && compile(v, parent.flags || '')) {
      rules.push({ parent, key: k, pattern: v, flags: parent.flags || '' });
    }
  };
  if (value && typeof value === 'object') walkJson(value, visit);
  return rules;
}

const kill = (p) => (hasNonAscii(p) ? `\\b(?:${p})\\b` : `^(?:${p})$`);

export default {
  id: 'dead-regex',
  title: 'Dead regex',
  formats: ['json'],
  summary: 'Wraps rule patterns in \\b…\\b (or ^…$) so they look stricter and can never match',

  applies(ctx) {
    const p = tryParseJson(ctx.text);
    if (!p.ok) return no('artifact is not valid JSON');
    return findRules(p.value).length ? ok() : no('no "pattern"/"regex" fields in this JSON');
  },

  mutate(ctx) {
    const v = JSON.parse(ctx.text);
    const rules = findRules(v);
    const before = rules.map((r) => ({ pattern: r.pattern, flags: r.flags, probes: probesFor(r.parent, r.pattern) }));
    for (const r of rules) r.parent[r.key] = kill(r.pattern);
    return {
      bytes: Buffer.from(stringifyLike(v, ctx.text)),
      before,
      after: rules.map((r) => r.parent[r.key]),
      note: `${rules.length} pattern${rules.length === 1 ? '' : 's'} wrapped in word boundaries/anchors ("${before[0].pattern.slice(0, 14)}" → "${kill(before[0].pattern).slice(0, 22)}")`,
    };
  },

  verify(ctx, m) {
    // Read the patterns back from the mutant bytes, not from what mutate() says it wrote.
    const parsed = tryParseJson(m.bytes.toString('utf8'));
    if (!parsed.ok) return no('mutant is not valid JSON');
    const after = findRules(parsed.value).map((r) => r.pattern);
    if (after.length !== m.before.length) return no('rule count changed');
    let probes = 0;
    let died = 0;
    m.before.forEach((b, i) => {
      const orig = compile(b.pattern, b.flags);
      const dead = compile(after[i], b.flags);
      if (!dead) return;
      for (const s of b.probes) {
        if (!orig.test(s)) continue; // the probe must match before the mutation to count
        probes++;
        if (!dead.test(s)) died++;
      }
    });
    if (probes === 0) return no('no example that the original patterns match; cannot prove the rule died');
    return died ? ok(`${died} of ${probes} examples no longer match`) : no('every example still matches');
  },
};
