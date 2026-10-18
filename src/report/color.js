// ANSI colour, only when it helps: TTY or FORCE_COLOR, and never when NO_COLOR is set.
export function colorEnabled(stream = process.stdout, env = process.env) {
  if ('NO_COLOR' in env && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return Boolean(stream.isTTY);
}

export function palette(enabled) {
  const wrap = (open, close) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
    redBold: (s) => wrap(1, 22)(wrap(31, 39)(s)),
    greenBold: (s) => wrap(1, 22)(wrap(32, 39)(s)),
  };
}

/** Visible length (ignores ANSI escapes). */
export const visibleLength = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;

export function pad(s, width) {
  const n = visibleLength(s);
  return n >= width ? s : s + ' '.repeat(width - n);
}

export function truncate(s, width) {
  const str = String(s);
  if (str.length <= width) return str;
  return width <= 1 ? str.slice(0, width) : str.slice(0, width - 1) + '…';
}
