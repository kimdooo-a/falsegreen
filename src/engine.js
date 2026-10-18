// The engine: baseline → mutate → self-test → guard → verdict.
//
// Three gates stand between a mutator and a FALSE GREEN verdict:
//   1. baseline  — the guard must accept the clean artifact, or nothing it says about mutants means anything;
//   2. bytes     — the mutant must differ from the original;
//   3. verify()  — the mutator must confirm the defect it claims to have introduced is really there.
// Any gate that fails yields INCONCLUSIVE. Only a confirmed defect that the guard accepted is a FALSE GREEN.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { detectFormat } from './formats.js';
import { runGuard } from './guard.js';
import { sha256 } from './util.js';
import { CAUGHT, FALSE_GREEN, INCONCLUSIVE, NOT_APPLICABLE } from './verdicts.js';

const liveMutants = new Set();
let sigintHooked = false;

function hookCleanup() {
  if (sigintHooked) return;
  sigintHooked = true;
  const clean = () => {
    for (const p of liveMutants) {
      try { unlinkSync(p); } catch { /* already gone */ }
    }
    liveMutants.clear();
  };
  process.on('exit', clean);
  process.on('SIGINT', () => { clean(); process.exit(130); });
}

export function mutantPath(artifactPath, mutatorId) {
  return resolve(dirname(artifactPath), `.fg-${mutatorId}-${basename(artifactPath)}`);
}

export function makeContext(artifactPath) {
  const path = resolve(artifactPath);
  const bytes = readFileSync(path);
  return {
    path,
    dir: dirname(path),
    name: basename(path),
    ext: extname(path).toLowerCase(),
    format: detectFormat(path, bytes),
    bytes,
    text: bytes.toString('utf8'),
  };
}

function describeExit(g) {
  if (g.timedOut) return 'guard timed out';
  if (g.spawnError) return `guard could not start: ${g.spawnError}`;
  if (g.exitCode === null) return `guard killed by ${g.signal}`;
  return `exit ${g.exitCode}`;
}

const firstLine = (s) => (s || '').split(/\r?\n/).find((l) => l.trim()) || '';

/**
 * Run every mutator against one artifact and one guard.
 * @param {object} o
 * @param {string} o.artifactPath
 * @param {string} o.guard          shell command; {artifact} is replaced by the file path
 * @param {object[]} o.mutators     mutator modules (see src/mutators/index.js)
 * @param {number} [o.timeoutMs]
 * @param {(result: object) => void} [o.onResult]  called as each result is decided (for streaming output)
 * @param {(baseline: object) => void} [o.onBaseline]
 */
export function runEngine({
  artifactPath, guard, mutators, timeoutMs = 30000,
  onContext = () => {}, onResult = () => {}, onBaseline = () => {},
}) {
  hookCleanup();
  const ctx = makeContext(artifactPath);
  const artifact = {
    path: ctx.path,
    name: ctx.name,
    format: ctx.format,
    bytes: ctx.bytes.length,
    sha256: sha256(ctx.bytes),
  };
  onContext(artifact);

  // Gate 1 — baseline.
  const g0 = runGuard(guard, ctx.path, { timeoutMs, cwd: process.cwd() });
  const baseline = {
    ok: g0.exitCode === 0 && !g0.timedOut,
    exitCode: g0.exitCode,
    ms: g0.ms,
    detail: describeExit(g0),
    stderr: firstLine(g0.stderr) || firstLine(g0.stdout),
  };
  onBaseline(baseline);

  const results = [];
  const emit = (r) => { results.push(r); onResult(r); };

  for (const m of mutators) {
    const base = { mutator: m.id, title: m.title, note: '', guard: null, bytesBefore: ctx.bytes.length, bytesAfter: null };

    if (!m.formats.includes(ctx.format)) {
      emit({ ...base, verdict: NOT_APPLICABLE, reason: `needs ${m.formats.join('/')}` });
      continue;
    }
    let applies;
    try {
      applies = m.applies(ctx);
    } catch (e) {
      emit({ ...base, verdict: INCONCLUSIVE, reason: `mutator error in applies(): ${e.message}` });
      continue;
    }
    if (!applies.ok) {
      emit({ ...base, verdict: NOT_APPLICABLE, reason: applies.reason });
      continue;
    }
    if (!baseline.ok) {
      emit({ ...base, verdict: INCONCLUSIVE, reason: `baseline failed (${baseline.detail}); the guard rejects the clean artifact` });
      continue;
    }

    let mutation;
    try {
      mutation = m.mutate(ctx);
    } catch (e) {
      emit({ ...base, verdict: INCONCLUSIVE, reason: `mutator error in mutate(): ${e.message}` });
      continue;
    }
    const after = Buffer.isBuffer(mutation.bytes) ? mutation.bytes : Buffer.from(mutation.bytes ?? '');
    const withBytes = { ...base, note: mutation.note || '', bytesAfter: after.length };

    // Gate 2 — did anything change at all?
    if (after.equals(ctx.bytes)) {
      emit({ ...withBytes, verdict: INCONCLUSIVE, reason: 'mutation did not change the artifact; nothing was tested' });
      continue;
    }
    // Gate 3 — is the claimed defect really there?
    let check;
    try {
      check = m.verify(ctx, { ...mutation, bytes: after });
    } catch (e) {
      check = { ok: false, reason: `verify() threw: ${e.message}` };
    }
    if (!check.ok) {
      emit({ ...withBytes, verdict: INCONCLUSIVE, reason: `self-test failed: ${check.reason}` });
      continue;
    }

    const mpath = mutantPath(ctx.path, m.id);
    if (existsSync(mpath)) {
      emit({ ...withBytes, verdict: INCONCLUSIVE, reason: `refusing to overwrite existing ${basename(mpath)}` });
      continue;
    }
    liveMutants.add(mpath);
    let g;
    try {
      writeFileSync(mpath, after);
      g = runGuard(guard, mpath, { timeoutMs, cwd: process.cwd() });
    } finally {
      try { unlinkSync(mpath); } catch { /* ignore */ }
      liveMutants.delete(mpath);
    }

    const guardInfo = { exitCode: g.exitCode, ms: g.ms, stderr: firstLine(g.stderr) || firstLine(g.stdout) };
    if (g.timedOut || g.spawnError || g.exitCode === null) {
      emit({ ...withBytes, guard: guardInfo, verdict: INCONCLUSIVE, reason: describeExit(g) });
    } else if (g.exitCode === 0) {
      emit({ ...withBytes, guard: guardInfo, verdict: FALSE_GREEN, reason: `guard exited 0 on a confirmed defect (${check.reason})` });
    } else {
      emit({ ...withBytes, guard: guardInfo, verdict: CAUGHT, reason: `guard exited ${g.exitCode}` });
    }
  }

  return { artifact, guard, baseline, results, summary: summarize(results, baseline) };
}

export function summarize(results, baseline) {
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const caught = count(CAUGHT);
  const falseGreen = count(FALSE_GREEN);
  return {
    families: results.length,
    tested: caught + falseGreen,
    caught,
    falseGreen,
    inconclusive: count(INCONCLUSIVE),
    notApplicable: count(NOT_APPLICABLE),
    blind: results.filter((r) => r.verdict === FALSE_GREEN).map((r) => r.mutator),
    baselineOk: baseline.ok,
  };
}

/** 0 = no false greens and something was tested; 1 = at least one false green; 2 = nothing could be proven. */
export function exitCodeFor(summary) {
  if (summary.falseGreen > 0) return 1;
  if (!summary.baselineOk || summary.tested === 0) return 2;
  return 0;
}
