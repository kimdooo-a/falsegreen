// Family 03 — occlusion.
// Draw an opaque shape over the text *after* it. Nothing is deleted, so every
// "is the text in the file?" check passes; nothing is visible either.
import { svgTexts, svgViewBox, estimateTextBox, attr } from '../util.js';
import { ok, no } from './_shared.js';

function backgroundFill(text, vb) {
  // The first full-canvas rect is usually the background; fall back to white.
  const re = /<rect\b[^>]*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const w = attr(m[0], 'width');
    const h = attr(m[0], 'height');
    const full = (v, size) => v === '100%' || Number(v) >= size;
    if (w && h && full(w, vb.w) && full(h, vb.h)) return attr(m[0], 'fill') || '#ffffff';
  }
  return '#ffffff';
}

export default {
  id: 'occlusion',
  title: 'Occlusion',
  formats: ['svg'],
  summary: 'Draws an opaque shape over the text after it: still in the file, no longer visible',

  applies(ctx) {
    if (!svgViewBox(ctx.text)) return no('svg has no viewBox or width/height');
    return svgTexts(ctx.text).some((t) => t.content) ? ok() : no('no <text> elements to cover');
  },

  mutate(ctx) {
    const vb = svgViewBox(ctx.text);
    const texts = svgTexts(ctx.text).filter((t) => t.content);
    const boxes = texts.map(estimateTextBox);
    const pad = 6;
    const x = Math.max(vb.x, Math.min(...boxes.map((b) => b.left)) - pad);
    const y = Math.max(vb.y, Math.min(...boxes.map((b) => b.top)) - pad);
    const r = Math.min(vb.x + vb.w, Math.max(...boxes.map((b) => b.right)) + pad);
    const b = Math.min(vb.y + vb.h, Math.max(...boxes.map((bb) => bb.bottom)) + pad);
    const fill = backgroundFill(ctx.text, vb);
    const rect = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(r - x).toFixed(1)}" height="${(b - y).toFixed(1)}" fill="${fill}"/>`;
    const close = ctx.text.lastIndexOf('</svg>');
    const out = ctx.text.slice(0, close) + `  ${rect}\n` + ctx.text.slice(close);
    return { bytes: Buffer.from(out), rect, note: `opaque rect over ${texts.length} text${texts.length === 1 ? '' : 's'}; text kept` };
  },

  verify(ctx, m) {
    const text = m.bytes.toString('utf8');
    const before = svgTexts(ctx.text).map((t) => t.content).join('\u0000');
    const after = svgTexts(text).map((t) => t.content).join('\u0000');
    if (before !== after) return no('text content changed; occlusion must not delete anything');
    const rectAt = text.lastIndexOf(m.rect);
    const lastText = text.lastIndexOf('</text>');
    if (rectAt < lastText) return no('covering shape is not drawn after the text');
    if (/fill="none"|opacity="0/.test(m.rect)) return no('covering shape is not opaque');
    return ok('all text present in the file but painted over by a later opaque shape');
  },
};
