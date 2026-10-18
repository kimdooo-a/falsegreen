import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { MUTATORS, byId } from '../src/mutators/index.js';
import { makeContext } from '../src/engine.js';
import { loadFixtures } from '../src/bench.js';
import { spreadsheetSci } from '../src/mutators/numeric-truncation.js';
import { parseWav } from '../src/util.js';
import { ROOT, tempArtifact } from '../testkit/common.mjs';

const FIXTURES = join(ROOT, 'bench', 'fixtures');

test('the catalogue has twelve families with unique ids and declared formats', () => {
  assert.equal(MUTATORS.length, 12);
  assert.equal(new Set(MUTATORS.map((m) => m.id)).size, 12);
  for (const m of MUTATORS) {
    assert.ok(m.formats.length > 0, `${m.id} declares formats`);
    for (const fn of ['applies', 'mutate', 'verify']) assert.equal(typeof m[fn], 'function', `${m.id}.${fn}`);
  }
});

test('every family has a bench fixture', () => {
  const families = loadFixtures(FIXTURES).map((f) => f.family);
  assert.deepEqual([...families].sort(), MUTATORS.map((m) => m.id).sort());
});

for (const fx of loadFixtures(FIXTURES)) {
  test(`${fx.family}: applies to its fixture, changes bytes, and passes its own self-test`, () => {
    const m = byId(fx.family);
    const ctx = makeContext(fx.path);
    assert.ok(m.formats.includes(ctx.format), `format ${ctx.format}`);
    assert.deepEqual(m.applies(ctx).ok, true);
    const mu = m.mutate(ctx);
    assert.ok(!Buffer.from(mu.bytes).equals(ctx.bytes), 'bytes changed');
    const v = m.verify(ctx, mu);
    assert.equal(v.ok, true, v.reason);
    assert.ok(mu.note.length > 0, 'describes what it broke');
  });
}

test('self-tests reject a mutant that does not carry the claimed defect', () => {
  // Hand every mutator its own clean input as the "mutant": no verify() may accept it.
  for (const fx of loadFixtures(FIXTURES)) {
    const m = byId(fx.family);
    const ctx = makeContext(fx.path);
    const fake = { ...m.mutate(ctx), bytes: ctx.bytes };
    assert.equal(m.verify(ctx, fake).ok, false, `${m.id} verify() accepted the unmutated artifact`);
  }
});

test('families refuse content they cannot break (NOT APPLICABLE, not a fake mutation)', () => {
  const plain = tempArtifact('plain.json', '{"a": 1}\n');
  const ctx = makeContext(plain.path);
  for (const id of ['empty-input', 'placeholder-as-content', 'stale-cache', 'numeric-truncation', 'dead-regex', 'self-referential-check', 'structured-overrides-body', 'declared-vs-rendered']) {
    assert.equal(byId(id).applies(ctx).ok, false, id);
  }
});

test('the demo report is testable by eight families', () => {
  const ctx = makeContext(join(ROOT, 'examples', 'report', 'report.json'));
  const applicable = MUTATORS.filter((m) => m.formats.includes(ctx.format) && m.applies(ctx).ok).map((m) => m.id);
  assert.deepEqual(applicable, [
    'empty-input', 'placeholder-as-content', 'declared-vs-rendered', 'metadata-identity',
    'stale-cache', 'numeric-truncation', 'self-referential-check', 'structured-overrides-body',
  ]);
});

test('numeric-truncation writes values the way a spreadsheet displays them', () => {
  assert.equal(spreadsheetSci(2150000000), '2.2E+09');
  assert.equal(spreadsheetSci(48250000), '4.8E+07');
  assert.equal(spreadsheetSci(-1234), '-1.2E+03');
});

test('dead-regex kills the non-ASCII alternative and leaves an ASCII-ending one alive (the real failure shape)', () => {
  const ctx = makeContext(join(FIXTURES, 'dead-regex', 'rules.json'));
  const m = byId('dead-regex');
  const mu = m.mutate(ctx);
  const dessert = new RegExp(mu.after[0], 'i');
  assert.equal(dessert.test('Meet me at the café'), false, '"café" ends in é: \\b can never follow it');
  assert.equal(dessert.test('Crème brûlée for dessert'), true, '"brûlée" ends in ASCII e: still alive');
});

test('silent-track keeps the original samples and appends exact digital silence', () => {
  const ctx = makeContext(join(FIXTURES, 'silent-track', 'narration.wav'));
  const mu = byId('silent-track').mutate(ctx);
  const a = parseWav(ctx.bytes);
  const b = parseWav(mu.bytes);
  assert.ok(b.data.subarray(0, a.data.length).equals(a.data));
  assert.equal(b.seconds - a.seconds, 1);
});
