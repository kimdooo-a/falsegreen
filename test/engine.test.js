import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine, exitCodeFor } from '../src/engine.js';
import placeholder from '../src/mutators/placeholder-as-content.js';
import { CAUGHT, FALSE_GREEN, INCONCLUSIVE, NOT_APPLICABLE } from '../src/verdicts.js';
import { guard, tempArtifact, leftovers, NOTES_MD } from '../testkit/common.mjs';

// Three deliberately broken mutators: the harness must never turn their output into a FALSE GREEN.
const noOp = {
  id: 'no-op', title: 'No-op', formats: ['markdown'], summary: 'changes nothing',
  applies: () => ({ ok: true }),
  mutate: (ctx) => ({ bytes: Buffer.from(ctx.bytes), note: 'did nothing' }),
  verify: () => ({ ok: true, reason: 'claims success anyway' }),
};

const liar = {
  id: 'liar', title: 'Liar', formats: ['markdown'], summary: 'changes bytes but not the defect it claims',
  applies: () => ({ ok: true }),
  mutate: (ctx) => ({ bytes: Buffer.concat([ctx.bytes, Buffer.from(' ')]), note: 'added a space' }),
  verify: () => ({ ok: false, reason: 'intended defect not present' }),
};

const thrower = {
  id: 'thrower', title: 'Thrower', formats: ['markdown'], summary: 'crashes',
  applies: () => ({ ok: true }),
  mutate: () => { throw new Error('boom'); },
  verify: () => ({ ok: true }),
};

const run = (g, mutators, path, extra = {}) => runEngine({ artifactPath: path, guard: g, mutators, ...extra });

test('a guard that passes everything yields FALSE GREEN and exit code 1', () => {
  const { path, dir } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('always-pass.mjs'), [placeholder], path);
  assert.equal(r.baseline.ok, true);
  assert.equal(r.results[0].verdict, FALSE_GREEN);
  assert.equal(exitCodeFor(r.summary), 1);
  assert.deepEqual(leftovers(dir), [], 'mutant files are cleaned up');
});

test('a guard that detects the defect yields CAUGHT and exit code 0', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('reject-lorem.mjs'), [placeholder], path);
  assert.equal(r.results[0].verdict, CAUGHT);
  assert.equal(exitCodeFor(r.summary), 0);
});

test('baseline failure makes every applicable result INCONCLUSIVE (exit 2)', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('always-fail.mjs'), [placeholder], path);
  assert.equal(r.baseline.ok, false);
  assert.equal(r.results[0].verdict, INCONCLUSIVE);
  assert.match(r.results[0].reason, /baseline failed/);
  assert.equal(exitCodeFor(r.summary), 2);
});

test('self-test: a mutator that changes nothing is INCONCLUSIVE, never FALSE GREEN', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('always-pass.mjs'), [noOp], path);
  assert.equal(r.results[0].verdict, INCONCLUSIVE);
  assert.match(r.results[0].reason, /did not change/);
  assert.equal(r.summary.falseGreen, 0);
  assert.equal(exitCodeFor(r.summary), 2, 'nothing was proven');
});

test('self-test: a mutator whose semantic check fails is INCONCLUSIVE', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('always-pass.mjs'), [liar], path);
  assert.equal(r.results[0].verdict, INCONCLUSIVE);
  assert.match(r.results[0].reason, /self-test failed: intended defect not present/);
});

test('a crashing mutator is INCONCLUSIVE', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('always-pass.mjs'), [thrower], path);
  assert.equal(r.results[0].verdict, INCONCLUSIVE);
  assert.match(r.results[0].reason, /boom/);
});

test('a family for another format is NOT APPLICABLE; nothing tested means exit 2', () => {
  const { path } = tempArtifact('tone.wav', Buffer.from('RIFF....WAVE'));
  const r = run(guard('always-pass.mjs'), [placeholder], path);
  assert.equal(r.results[0].verdict, NOT_APPLICABLE);
  assert.equal(exitCodeFor(r.summary), 2);
});

test('a guard that hangs is INCONCLUSIVE, not a pass', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = run(guard('sleep.mjs', '2000'), [placeholder], path, { timeoutMs: 400 });
  assert.equal(r.baseline.ok, false);
  assert.equal(r.results[0].verdict, INCONCLUSIVE);
  assert.equal(r.summary.falseGreen, 0);
});
