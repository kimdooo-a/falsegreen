import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommand, runGuard } from '../src/guard.js';
import { guard, tempArtifact } from '../testkit/common.mjs';

test('buildCommand replaces every {artifact} with a quoted path', () => {
  assert.equal(buildCommand('check {artifact} --again {artifact}', '/a b/c.json'), 'check "/a b/c.json" --again "/a b/c.json"');
});

test('buildCommand appends the path when there is no placeholder', () => {
  assert.equal(buildCommand('python verify.py', 'x.md'), 'python verify.py "x.md"');
});

test('runGuard reports the exit code', () => {
  const { path } = tempArtifact('a.txt', 'hello world');
  assert.equal(runGuard(guard('always-pass.mjs'), path).exitCode, 0);
  assert.equal(runGuard(guard('always-fail.mjs'), path).exitCode, 3);
});

test('runGuard handles paths with spaces and non-ASCII characters', () => {
  const { path } = tempArtifact('note with spaces é.md', 'Lorem ipsum dolor sit amet');
  assert.equal(runGuard(guard('reject-lorem.mjs'), path).exitCode, 1);
});

test('runGuard flags a hung guard as timed out', () => {
  const { path } = tempArtifact('a.txt', 'hello world');
  const r = runGuard(guard('sleep.mjs', '2000'), path, { timeoutMs: 400 });
  assert.equal(r.timedOut, true);
});
