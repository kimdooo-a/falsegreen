#!/usr/bin/env node
// The 30-second demo, scripted for screen recording.
//   node examples/demo.mjs            (with pauses, for recording)
//   node examples/demo.mjs --fast     (no pauses)
// Best in an 80–100 column terminal. Colour follows NO_COLOR / FORCE_COLOR.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin', 'falsegreen.js');
const fast = process.argv.includes('--fast');
const color = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const dim = (s) => (color ? `\x1b[2m${s}\x1b[22m` : s);
const bold = (s) => (color ? `\x1b[1m${s}\x1b[22m` : s);
const sleep = (ms) => { if (!fast) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

function act(caption, args) {
  console.log(`\n${dim('# ' + caption)}`);
  // Echo the command, one flag per line, so it fits an 80-column recording.
  const q = (a) => (/\s/.test(a) ? `"${a}"` : a);
  const parts = [`falsegreen ${args[0]}`];
  for (let i = 1; i < args.length; i += 2) parts.push(`    ${args[i]} ${q(args[i + 1] ?? '')}`.trimEnd());
  console.log(`${bold('$')} ${parts.join(' \\\n')}`);
  sleep(900);
  spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(color ? { FORCE_COLOR: '1' } : {}) },
  });
  sleep(2600);
}

act('1. A careful hand-written guard: fields, counts, attachments on disk.', [
  'run', '--guard', 'node examples/report/verify-report.mjs {artifact}', '--artifact', 'examples/report/report.json',
]);

act('2. Same report, a guard that checks content instead of trusting labels.', [
  'run', '--guard', 'node bench/guards/hardened.mjs {artifact}', '--artifact', 'examples/report/report.json',
]);

act('3. The bench: one fixture per family, two reference guards, known answers.', ['bench']);
