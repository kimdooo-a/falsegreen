// Bench: fixtures with known answers, scored against reference guards (and optionally yours).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MUTATORS, byId, familyNumber } from './mutators/index.js';
import { runEngine } from './engine.js';
import { colorEnabled, palette, pad, truncate } from './report/color.js';
import { termWidth, verdictCell } from './report/terminal.js';
import { CAUGHT, FALSE_GREEN } from './verdicts.js';

export function loadFixtures(fixturesDir) {
  const order = (id) => MUTATORS.findIndex((m) => m.id === id);
  return readdirSync(fixturesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(fixturesDir, d.name, 'expected.json')))
    .map((d) => {
      const e = JSON.parse(readFileSync(join(fixturesDir, d.name, 'expected.json'), 'utf8'));
      return { ...e, dir: join(fixturesDir, d.name), path: join(fixturesDir, d.name, e.artifact) };
    })
    .sort((a, b) => order(a.family) - order(b.family));
}

export function referenceGuards(root) {
  const node = `"${process.execPath}"`;
  return [
    { name: 'naive', command: `${node} "${join(root, 'bench', 'guards', 'naive.mjs')}" {artifact}` },
    { name: 'hardened', command: `${node} "${join(root, 'bench', 'guards', 'hardened.mjs')}" {artifact}` },
  ];
}

/** Run every fixture's own family against every guard. */
export function runBench({ fixturesDir, guards, timeoutMs = 30000, onRow = () => {} }) {
  const rows = [];
  for (const fx of loadFixtures(fixturesDir)) {
    const mutator = byId(fx.family);
    if (!mutator) throw new Error(`fixture ${fx.dir} names unknown family "${fx.family}"`);
    const cells = {};
    for (const g of guards) {
      const r = runEngine({ artifactPath: fx.path, guard: g.command, mutators: [mutator], timeoutMs });
      const res = r.results[0];
      const expected = fx.expect?.[g.name];
      cells[g.name] = { verdict: res.verdict, reason: res.reason, expected, met: expected ? expected === res.verdict : null };
    }
    const row = { family: fx.family, artifact: fx.artifact, cells };
    rows.push(row);
    onRow(row);
  }
  const coverage = Object.fromEntries(guards.map((g) => {
    const vs = rows.map((r) => r.cells[g.name].verdict);
    const caught = vs.filter((v) => v === CAUGHT).length;
    const tested = vs.filter((v) => v === CAUGHT || v === FALSE_GREEN).length;
    return [g.name, { caught, tested, pct: tested ? Math.round((caught / tested) * 100) : 0 }];
  }));
  const checks = rows.flatMap((r) => Object.values(r.cells).filter((c) => c.met !== null));
  return { rows, coverage, expectations: { met: checks.filter((c) => c.met).length, total: checks.length } };
}

export function runBenchCli(flags, io, { root, version }) {
  const fixturesDir = join(root, 'bench', 'fixtures');
  const guards = referenceGuards(root);
  if (flags.guard) guards.push({ name: 'yours', command: flags.guard });
  const c = palette(!flags['no-color'] && colorEnabled(io.stdout, io.env));
  const W = termWidth(io.stdout);
  const w = (s = '') => io.stdout.write(s.replace(/\s+$/, '') + '\n');
  const COL = 15;
  const famW = 27;
  const fixW = Math.min(20, Math.max(12, W - 4 - 4 - famW - COL * guards.length));

  if (!flags.json) {
    w();
    w(`  ${c.bold('falsegreen bench')}${c.dim(` ${version}`)}  ${c.dim(`${loadFixtures(fixturesDir).length} fixtures × ${guards.length} guards`)}`);
    w();
    w(`  ${c.dim(pad('#', 4) + pad('FAILURE FAMILY', famW) + pad('FIXTURE', fixW) + guards.map((g) => pad(g.name, COL)).join(''))}`);
    w(`  ${c.dim('─'.repeat(W - 4))}`);
  }
  const result = runBench({
    fixturesDir,
    guards,
    onRow: (row) => {
      if (flags.json) return;
      const cells = guards.map((g) => {
        const cell = row.cells[g.name];
        const mark = cell.met === false ? c.redBold('!') : '';
        return pad(verdictCell(c, cell.verdict) + mark, COL);
      }).join('');
      w(`  ${c.dim(pad(familyNumber(row.family), 4))}${pad(row.family, famW)}${c.dim(pad(truncate(row.artifact, fixW - 1), fixW))}${cells}`);
    },
  });

  if (flags.json) {
    w(JSON.stringify({ tool: 'falsegreen', version, ...result }, null, 2));
  } else {
    w(`  ${c.dim('─'.repeat(W - 4))}`);
    const cov = guards.map((g) => {
      const k = result.coverage[g.name];
      const s = `${k.caught}/${k.tested} ${k.pct}%`;
      return pad(k.pct === 100 ? c.greenBold(s) : k.pct < 50 ? c.redBold(s) : c.yellow(s), COL);
    }).join('');
    w(`  ${pad(c.bold('coverage') + c.dim(' (caught / tested)'), 4 + famW + fixW)}${cov}`);
    const e = result.expectations;
    w(`  ${c.dim('expectations met:')} ${e.met === e.total ? c.green(`${e.met}/${e.total}`) : c.redBold(`${e.met}/${e.total}`)}${c.dim('   (bench/fixtures/*/expected.json)')}`);
    w();
    const naive = result.coverage.naive;
    const hard = result.coverage.hardened;
    const blind = (k) => k.tested - k.caught;
    const show = (k) => (blind(k) ? c.redBold(`${blind(k)} of ${k.tested}`) : c.greenBold(`0 of ${k.tested}`));
    w(`  Naive guard: blind to ${show(naive)} families.  Hardened guard: blind to ${show(hard)}.`);
    if (result.coverage.yours) {
      const y = result.coverage.yours;
      w(`  Your guard: blind to ${show(y)} testable families.`);
      w(`  ${c.dim('INCONCLUSIVE rows mean your guard rejected that clean fixture.')}`);
    }
    w();
  }
  // Exit code: expectations are the eval; a mismatch is a regression.
  return result.expectations.met === result.expectations.total ? 0 : 1;
}


