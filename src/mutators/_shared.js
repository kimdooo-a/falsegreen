// Helpers shared by several mutators.

const BRACKETED = '[Write the summary here] ';
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

/** Template text with the same character length as `original` (so size-based checks stay quiet). */
export function fillLike(original) {
  const n = [...original].length;
  const source = n >= 30 ? BRACKETED + LOREM.repeat(Math.ceil(n / LOREM.length) + 1) : LOREM.repeat(2);
  return source.slice(0, n).replace(/\s+$/, (ws) => '.'.repeat(ws.length));
}

export const PLACEHOLDER_RE = /lorem ipsum|\[(write|insert|enter|add)[^\]]*\]|\b(TBD|TODO|FIXME)\b|your text here|placeholder/i;

/** Prose-like: has a space and enough letters to be content, not an id, path, date or hash. */
export const isProse = (s, min = 12) =>
  typeof s === 'string' && s.length >= min && /\s/.test(s) && /\p{L}{3}/u.test(s) && !/^https?:\/\//.test(s);

export const pct = (a, b) => {
  const d = ((b - a) / a) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
};

export const ok = (reason) => ({ ok: true, reason });
export const no = (reason) => ({ ok: false, reason });

/** Insert `.final` before the extension: assets/chart.svg -> assets/chart.final.svg */
export function plausibleMissingName(p) {
  const m = p.match(/^(.*?)(\.[^./\\]+)?$/);
  return `${m[1]}.final${m[2] || ''}`;
}

export const PATH_KEY_RE = /^(path|file|filename|src|href|attachment|asset|image|output)s?$/i;
export const DIGEST_KEY_RE = /(^|_)(sha256|sha1|md5|digest|etag|checksum|hash)$/i;
export const COUNT_KEY_RE = /^(\w+?)_?count$/i;
export const isLocalRef = (s) =>
  typeof s === 'string' && s.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith('#') && !s.startsWith('/');
