import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HELPERS = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HELPERS, '..');
export const node = `"${process.execPath}"`;
export const guard = (name, extra = '') => `${node} "${join(HELPERS, name)}" {artifact}${extra ? ' ' + extra : ''}`;

export function tempArtifact(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'falsegreen-test-'));
  const path = join(dir, name);
  writeFileSync(path, content);
  return { dir, path };
}

export const leftovers = (dir) => readdirSync(dir).filter((f) => f.startsWith('.fg-'));

export const NOTES_MD =
  '# Weekly notes\n\nThe migration finished on Tuesday and all twelve services moved.\n\n- Latency dropped by a third after the cache change.\n';
