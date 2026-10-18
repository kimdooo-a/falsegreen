import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, guard, tempArtifact, NOTES_MD } from '../testkit/common.mjs';

const BIN = join(ROOT, 'bin', 'falsegreen.js');
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const REPORT = join(ROOT, 'examples', 'report', 'report.json');
const NAIVE = `"${process.execPath}" "${join(ROOT, 'bench', 'guards', 'naive.mjs')}" {artifact}`;
const HARDENED = `"${process.execPath}" "${join(ROOT, 'bench', 'guards', 'hardened.mjs')}" {artifact}`;

test('no arguments prints usage and exits 2', () => {
  const r = cli();
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Usage/);
});

test('--version prints the package version', () => {
  const r = cli('--version');
  assert.equal(r.stdout.trim(), JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
});

test('list shows all twelve families', () => {
  const r = cli('list', '--json');
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).length, 12);
});

test('usage errors exit 2 with a message', () => {
  assert.equal(cli('run', '--artifact', REPORT).status, 2);
  const r = cli('run', '--guard', 'x', '--artifact', REPORT, '--mutators', 'nope');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown failure family: nope/);
});

test('run --json: naive guard is blind, exit 1', () => {
  const r = cli('run', '--guard', NAIVE, '--artifact', REPORT, '--json');
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, 'falsegreen');
  assert.equal(j.baseline.ok, true);
  assert.equal(j.summary.tested, 8);
  assert.equal(j.summary.falseGreen, 8);
  assert.equal(j.summary.notApplicable, 4);
});

test('run --json: hardened guard catches every applicable family, exit 0', () => {
  const r = cli('run', '--guard', HARDENED, '--artifact', REPORT, '--json');
  assert.equal(r.status, 0, r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.summary.caught, 8);
  assert.equal(j.summary.falseGreen, 0);
});

test('run prints the blind-to summary line and a FAILURE_MODES anchor', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = cli('run', '--guard', guard('always-pass.mjs'), '--artifact', path, '--mutators', 'placeholder-as-content');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Your guard is blind to 1 of 1 failure families\./);
  assert.match(r.stdout, /FAILURE_MODES\.md#placeholder-as-content/);
  assert.doesNotMatch(r.stdout, /\x1b\[/, 'NO_COLOR is respected');
});

test('run --report writes a Markdown report', () => {
  const { path, dir } = tempArtifact('notes.md', NOTES_MD);
  const out = join(dir, 'report.md');
  cli('run', '--guard', guard('always-pass.mjs'), '--artifact', path, '--report', out);
  assert.ok(existsSync(out));
  const md = readFileSync(out, 'utf8');
  assert.match(md, /# falsegreen report/);
  assert.match(md, /\*\*FALSE GREEN\*\*/);
  assert.match(md, /\(FAILURE_MODES\.md#placeholder-as-content\)/);
});

test('a guard that rejects the clean artifact: nothing proven, exit 2', () => {
  const { path } = tempArtifact('notes.md', NOTES_MD);
  const r = cli('run', '--guard', guard('always-fail.mjs'), '--artifact', path);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /guard rejects the clean artifact/);
  assert.match(r.stdout, /Nothing was proven/);
});
