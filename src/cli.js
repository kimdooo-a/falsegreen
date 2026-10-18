// Command-line interface: run, bench, list.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { MUTATORS, byId, familyNumber } from './mutators/index.js';
import { runEngine, exitCodeFor } from './engine.js';
import { colorEnabled, palette, pad, truncate } from './report/color.js';
import { createTerminalReporter, termWidth } from './report/terminal.js';
import { toJson } from './report/json.js';
import { toMarkdown } from './report/markdown.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const USAGE = `falsegreen ${VERSION} — mutation testing for the guards in your pipeline

Break a known-good artifact on purpose, hand it to your guard, and report
every time the guard still exits 0. That pass is a FALSE GREEN.

Usage
  falsegreen run   --guard "<command with {artifact}>" --artifact <path> [options]
  falsegreen bench [--guard "<command>"] [--json]
  falsegreen list

Run options
  --guard <cmd>        Shell command that checks one file. {artifact} is replaced
                       by the file path (appended if absent). Only the exit code is read.
  --artifact <path>    A known-good artifact your pipeline produced.
  --mutators <a,b>     Only these failure families (see: falsegreen list).
  --timeout <sec>      Per-guard timeout, default 30.
  --json               Print one JSON document instead of the table.
  --report <file.md>   Also write a Markdown report.
  --verbose            Show each verdict's reason and the guard's first output line.
  --no-color           Disable colour (NO_COLOR is also respected).

Verdicts
  CAUGHT         the guard failed the broken artifact (good)
  FALSE GREEN    the guard passed a confirmed defect
  INCONCLUSIVE   nothing was proven: baseline failed, mutation was a no-op, or the guard hung
  n/a            the family does not apply to this format or content

Exit codes
  0  no false greens   1  at least one false green   2  nothing proven / usage error
`;

export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  const valueFlags = new Set(['guard', 'artifact', 'mutators', 'report', 'timeout']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (valueFlags.has(name)) {
        const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
        if (v === undefined) throw new UsageError(`--${name} needs a value`);
        out.flags[name] = v;
      } else out.flags[name] = true;
    } else if (a === '-h') out.flags.help = true;
    else if (a === '-v') out.flags.version = true;
    else out._.push(a);
  }
  return out;
}

class UsageError extends Error {}

function selectMutators(spec) {
  if (!spec) return MUTATORS;
  const ids = spec.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !byId(id));
  if (unknown.length) throw new UsageError(`unknown failure famil${unknown.length > 1 ? 'ies' : 'y'}: ${unknown.join(', ')} (see: falsegreen list)`);
  return MUTATORS.filter((m) => ids.includes(m.id));
}

function cmdRun(flags, io) {
  if (!flags.guard) throw new UsageError('run needs --guard "<command with {artifact}>"');
  if (!flags.artifact) throw new UsageError('run needs --artifact <path>');
  const artifactPath = resolve(flags.artifact);
  if (!existsSync(artifactPath)) throw new UsageError(`artifact not found: ${flags.artifact}`);
  const mutators = selectMutators(flags.mutators);
  const timeoutMs = Math.round(Number(flags.timeout ?? 30) * 1000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new UsageError('--timeout must be a positive number of seconds');

  const color = !flags['no-color'] && colorEnabled(io.stdout, io.env);
  const term = flags.json ? null : createTerminalReporter({ out: io.stdout, color, verbose: Boolean(flags.verbose), version: VERSION });

  const result = runEngine({
    artifactPath,
    guard: flags.guard,
    mutators,
    timeoutMs,
    // The header needs the detected format, which the engine computes before the baseline.
    onContext: (a) => term?.header({ artifactPath: a.path, format: a.format, bytes: a.bytes, guard: flags.guard }),
    onBaseline: (b) => term?.baseline(b),
    onResult: (r) => term?.row(r),
  });

  if (term) term.footer(result.summary);
  else io.stdout.write(toJson(result, VERSION) + '\n');

  if (flags.report) {
    const path = resolve(flags.report);
    writeFileSync(path, toMarkdown(result, VERSION));
    if (term) io.stdout.write(`  Markdown report written to ${flags.report}\n\n`);
  }
  return exitCodeFor(result.summary);
}

function cmdList(flags, io) {
  const c = palette(!flags['no-color'] && colorEnabled(io.stdout, io.env));
  const W = termWidth(io.stdout);
  const w = (s = '') => io.stdout.write(s + '\n');
  if (flags.json) {
    w(JSON.stringify(MUTATORS.map((m) => ({ id: m.id, number: familyNumber(m.id), title: m.title, formats: m.formats, summary: m.summary })), null, 2));
    return 0;
  }
  w();
  w(`  ${c.bold('falsegreen')} ${c.dim(`· ${MUTATORS.length} failure families · details in FAILURE_MODES.md`)}`);
  w();
  w(`  ${c.dim(pad('#', 4) + pad('FAMILY', 28) + 'FORMATS')}`);
  w(`  ${c.dim('─'.repeat(W - 4))}`);
  for (const m of MUTATORS) {
    w(`  ${c.dim(pad(familyNumber(m.id), 4))}${pad(c.bold(m.id), 28)}${c.cyan(m.formats.join(' '))}`);
    w(`  ${' '.repeat(4)}${c.dim(truncate(m.summary, W - 8))}`);
  }
  w();
  return 0;
}

async function cmdBench(flags, io) {
  const { runBenchCli } = await import('./bench.js');
  return runBenchCli(flags, io, { root: ROOT, version: VERSION, UsageError });
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr, env: process.env }) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.flags.version) { io.stdout.write(VERSION + '\n'); return 0; }
    const [cmd] = args._;
    if (!cmd || args.flags.help) { io.stdout.write(USAGE); return cmd || args.flags.help ? 0 : 2; }
    if (cmd === 'run') return cmdRun(args.flags, io);
    if (cmd === 'list') return cmdList(args.flags, io);
    if (cmd === 'bench') return await cmdBench(args.flags, io);
    throw new UsageError(`unknown command: ${cmd}`);
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr.write(`falsegreen: ${e.message}\nRun "falsegreen --help" for usage.\n`);
      return 2;
    }
    throw e;
  }
}
