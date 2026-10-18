// Family 04 — overflow.
// Grow the longest line until it runs past the canvas. SVG has no wrapping and no
// shrink-to-fit: the tail is simply not drawn, and the file is perfectly valid.
import { svgTexts, svgViewBox, estimateTextBox } from '../util.js';
import { ok, no } from './_shared.js';

const inside = (box, vb) => box.left >= vb.x && box.right <= vb.x + vb.w;

function setFontSize(open, size) {
  const s = size.toFixed(0);
  if (/\bfont-size\s*=\s*"[^"]*"/i.test(open)) return open.replace(/\bfont-size\s*=\s*"[^"]*"/i, `font-size="${s}"`);
  if (/font-size\s*:\s*[\d.]+(px)?/i.test(open)) return open.replace(/font-size\s*:\s*[\d.]+(px)?/i, `font-size:${s}px`);
  return `${open} font-size="${s}"`;
}

export default {
  id: 'overflow',
  title: 'Overflow',
  formats: ['svg'],
  summary: 'Pushes a line of text past the edge of its fixed-size canvas, where it is silently clipped',

  applies(ctx) {
    const vb = svgViewBox(ctx.text);
    if (!vb) return no('svg has no viewBox or width/height');
    const texts = svgTexts(ctx.text).filter((t) => t.content && !/<tspan/i.test(t.inner));
    return texts.length ? ok() : no('no plain <text> elements');
  },

  mutate(ctx) {
    const vb = svgViewBox(ctx.text);
    const texts = svgTexts(ctx.text).filter((t) => t.content && !/<tspan/i.test(t.inner));
    const target = texts.reduce((a, b) => (estimateTextBox(b).right - estimateTextBox(b).left > estimateTextBox(a).right - estimateTextBox(a).left ? b : a));
    const box = estimateTextBox(target);
    const width = box.right - box.left;
    // Scale so the estimated width is 1.35x the canvas, and never less than 2x the original size.
    const factor = Math.max(2, (vb.w * 1.35) / Math.max(width, 1));
    const newSize = box.size * factor;
    const newOpen = setFontSize(target.open, newSize);
    const out = ctx.text.slice(0, target.index) + '<text' + newOpen + ctx.text.slice(target.index + 5 + target.open.length);
    const after = estimateTextBox({ ...target, open: newOpen });
    const overBy = Math.round(Math.max(after.right - (vb.x + vb.w), vb.x - after.left));
    return {
      bytes: Buffer.from(out),
      target: target.content,
      note: `font ${box.size}→${Math.round(newSize)}px: ~${overBy}px past the edge`,
    };
  },

  verify(ctx, m) {
    const vb = svgViewBox(ctx.text);
    const before = svgTexts(ctx.text).find((t) => t.content === m.target);
    const after = svgTexts(m.bytes.toString('utf8')).find((t) => t.content === m.target);
    if (!before || !after) return no('target text element not found');
    if (!inside(estimateTextBox(before), vb)) return no('text already overflowed in the original');
    if (inside(estimateTextBox(after), vb)) return no('text still fits inside the canvas');
    return ok('estimated text box now extends past the viewBox');
  },
};
