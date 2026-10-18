import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runBench, referenceGuards } from '../src/bench.js';
import { ROOT } from '../testkit/common.mjs';

test('bench: every fixture meets its expected verdict for both reference guards', () => {
  const r = runBench({ fixturesDir: join(ROOT, 'bench', 'fixtures'), guards: referenceGuards(ROOT) });
  const misses = r.rows.flatMap((row) => Object.entries(row.cells)
    .filter(([, c]) => c.met === false)
    .map(([g, c]) => `${row.family}/${g}: expected ${c.expected}, got ${c.verdict} (${c.reason})`));
  assert.deepEqual(misses, []);
  assert.equal(r.expectations.total, 24);
  assert.equal(r.coverage.hardened.caught, 12);
});
