// Family 05 — declared-vs-rendered.
// The file states one thing, the reader will render another.
//   SVG:  declare a font the renderer does not have. The file records the request;
//         the renderer substitutes a fallback and says nothing.
//   Text: keep the content, re-encode it with a legacy 8-bit encoding. The file is still
//         read as UTF-8 (JSON and most tools assume it), so every accented character
//         renders as U+FFFD — while length, line count and JSON.parse() all still pass.
import { isStrictUtf8, hasNonAscii } from '../util.js';
import { ok, no } from './_shared.js';

export const UNAVAILABLE_FONT = 'Avenir Next LT Pro';
const FONT_RE = /(font-family\s*=\s*")([^"]*)(")|(font-family\s*:\s*)([^;"}]+)/gi;
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i;

function declaredFonts(text) {
  const out = new Set();
  for (const m of text.matchAll(FONT_RE)) out.add((m[2] ?? m[5]).trim());
  return [...out];
}

/** Lossy legacy encoding: code points <= 0xFF become one byte, anything else '?'. */
function toLatin1(text) {
  const out = Buffer.alloc(text.length * 1);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    out[n++] = cp <= 0xff ? cp : 0x3f;
  }
  return out.subarray(0, n);
}

const strategy = (ctx) => {
  if (ctx.format === 'svg' && declaredFonts(ctx.text).length) return 'font';
  if (isStrictUtf8(ctx.bytes) && hasNonAscii(ctx.text)) return 'encoding';
  return null;
};

export default {
  id: 'declared-vs-rendered',
  title: 'Declared vs rendered',
  formats: ['svg', 'text', 'markdown', 'csv', 'json'],
  summary: 'The file declares one font/encoding while the reader renders another (silent fallback)',

  applies(ctx) {
    if (strategy(ctx)) return ok();
    return no(ctx.format === 'svg' ? 'no font-family declared and no non-ASCII text' : 'no non-ASCII characters to mis-encode');
  },

  mutate(ctx) {
    if (strategy(ctx) === 'font') {
      const before = declaredFonts(ctx.text);
      const out = ctx.text.replace(FONT_RE, (all, a1, v1, a3, b1) =>
        a1 !== undefined ? `${a1}${UNAVAILABLE_FONT}${a3}` : `${b1}'${UNAVAILABLE_FONT}'`);
      return { bytes: Buffer.from(out), strategy: 'font', note: `font "${before[0]}" → "${UNAVAILABLE_FONT}" (not installed)` };
    }
    const bytes = toLatin1(ctx.text);
    const changed = [...ctx.text].filter((c) => c.codePointAt(0) > 0x7f).length;
    return { bytes, strategy: 'encoding', note: `re-encoded Latin-1: ${changed} char${changed === 1 ? '' : 's'} now read as U+FFFD` };
  },

  verify(ctx, m) {
    if (m.strategy === 'font') {
      const after = declaredFonts(m.bytes.toString('utf8'));
      const before = declaredFonts(ctx.text);
      if (!after.length) return no('no font declaration left');
      if (after.some((f) => before.includes(f))) return no('original font still declared');
      if (after.every((f) => GENERIC.test(f.replace(/['"]/g, '')))) return no('only generic families declared');
      return ok(`declares "${UNAVAILABLE_FONT}", which the renderer will silently substitute`);
    }
    if (isStrictUtf8(m.bytes)) return no('mutant is still valid UTF-8');
    const lenient = m.bytes.toString('utf8');
    if (!lenient.includes('�')) return no('no replacement characters when read as UTF-8');
    return ok('invalid UTF-8; a UTF-8 reader shows U+FFFD where the accents were');
  },
};
