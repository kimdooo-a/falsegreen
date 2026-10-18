// Format detection: extension first, then content sniffing.
import { extname } from 'node:path';

export const FORMATS = ['text', 'markdown', 'json', 'csv', 'svg', 'wav'];

const BY_EXT = {
  '.txt': 'text', '.text': 'text', '.log': 'text',
  '.md': 'markdown', '.markdown': 'markdown',
  '.json': 'json',
  '.csv': 'csv',
  '.svg': 'svg',
  '.wav': 'wav', '.wave': 'wav',
};

export function detectFormat(path, bytes) {
  const byExt = BY_EXT[extname(path).toLowerCase()];
  if (byExt) return byExt;
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  const head = bytes.subarray(0, 512).toString('utf8').trimStart();
  if (/^(<\?xml[^>]*>\s*)?<svg\b/i.test(head)) return 'svg';
  if (/^[[{]/.test(head)) return 'json';
  if (/^---\r?\n/.test(head) || /^#{1,6} /m.test(head)) return 'markdown';
  if (bytes.includes(0)) return 'unknown';
  return 'text';
}
