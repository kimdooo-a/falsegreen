// Terminal report. Streams one row per family as the verdicts arrive.
import { relative, isAbsolute } from 'node:path';
import { palette, pad, truncate } from './color.js';
import { familyNumber } from '../mutators/index.js';
import { CAUGHT, FALSE_GREEN, INCONCLUSIVE, NOT_APPLICABLE, LABEL } from '../verdicts.js';
import { formatBytes } from '../util.js';

export const DOCS = 'FAILURE_MODES.md';

export function displayPath(p, cwd = process.cwd()) {
  const rel = relative(cwd, p);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split('\\').join('/') : p;
}

export function termWidth(stream = process.stdout) {
  const cols = stream.columns || 100;
  return Math.max(72, Math.min(cols, 100));
}

export function verdictCell(c, verdict) {
  const label = LABEL[verdict];
  switch (verdict) {
    case CAUGHT: return c.green(`✓ ${label}`);
    case FALSE_GREEN: return c.redBold(`✗ ${label}`);
    case INCONCLUSIVE: return c.yellow(`? ${label}`);
    default: return c.dim(`· ${label}`);
  }
}

export function createTerminalReporter({ out = process.stdout, color, verbose = false, version = '' } = {}) {
  const c = palette(color);
  const W = termWidth(out);
  const write = (s = '') => out.write(s.replace(/\s+$/, '') + '\n');
  const COL_FAMILY = 28;
  const COL_VERDICT = 15;
  const COL_NOTE = W - 2 - 4 - COL_FAMILY - COL_VERDICT;

  return {
    header({ artifactPath, format, bytes, guard }) {
      write();
      write(`  ${c.bold('falsegreen')}${version ? c.dim(` ${version}`) : ''}  ${c.dim('mutation testing for the guards in your pipeline')}`);
      write();
      write(`  ${c.dim('artifact')}  ${displayPath(artifactPath)}  ${c.dim(`(${format}, ${formatBytes(bytes)})`)}`);
      write(`  ${c.dim('guard   ')}  ${truncate(guard, W - 14)}`);
    },
    baseline(b) {
      if (b.ok) {
        write(`  ${c.dim('baseline')}  ${c.green('✓')} guard accepts the clean artifact ${c.dim(`(exit 0, ${b.ms} ms)`)}`);
      } else {
        write(`  ${c.dim('baseline')}  ${c.yellow('?')} ${c.yellow(`guard rejects the clean artifact (${b.detail})`)}`);
        if (b.stderr) write(`            ${c.dim(truncate(b.stderr, W - 14))}`);
        write(`            ${c.dim('A guard that fails good input proves nothing about bad input.')}`);
      }
      write();
      write(`  ${c.dim(pad('#', 4) + pad('FAILURE FAMILY', COL_FAMILY) + pad('VERDICT', COL_VERDICT) + 'WHAT WE BROKE')}`);
      write(`  ${c.dim('─'.repeat(W - 4))}`);
    },
    row(r) {
      const num = c.dim(pad(familyNumber(r.mutator), 4));
      const fam = pad(r.verdict === NOT_APPLICABLE ? c.dim(r.mutator) : r.mutator, COL_FAMILY);
      const v = pad(verdictCell(c, r.verdict), COL_VERDICT);
      let note;
      if (r.verdict === NOT_APPLICABLE) note = c.dim(truncate(r.reason, COL_NOTE));
      else if (r.verdict === INCONCLUSIVE) note = c.yellow(truncate(r.reason, COL_NOTE));
      else note = truncate(r.note, COL_NOTE);
      write(`  ${num}${fam}${v}${note}`);
      if (verbose && r.verdict !== NOT_APPLICABLE) {
        write(`  ${' '.repeat(4 + COL_FAMILY)}${c.dim(truncate(r.reason, COL_NOTE + COL_VERDICT))}`);
        if (r.guard?.stderr) write(`  ${' '.repeat(4 + COL_FAMILY)}${c.dim(truncate('guard: ' + r.guard.stderr, COL_NOTE + COL_VERDICT))}`);
      }
    },
    footer(s) {
      write(`  ${c.dim('─'.repeat(W - 4))}`);
      const parts = [
        `${s.tested} tested`,
        c.green(`${s.caught} caught`),
        s.falseGreen ? c.redBold(`${s.falseGreen} false green`) : `0 false green`,
        s.inconclusive ? c.yellow(`${s.inconclusive} inconclusive`) : '0 inconclusive',
        c.dim(`${s.notApplicable} n/a`),
      ];
      write(`  ${parts.join(c.dim(' · '))}`);
      write();
      if (!s.baselineOk) {
        write(`  ${c.yellow('?')} ${c.bold('Nothing was proven:')} fix the guard so it accepts the clean artifact, then re-run.`);
      } else if (s.tested === 0) {
        write(`  ${c.yellow('?')} ${c.bold('Nothing was proven:')} no failure family could be tested on this artifact.`);
      } else {
        const line = `Your guard is blind to ${s.falseGreen} of ${s.tested} failure families.`;
        write(`  ${s.falseGreen ? c.redBold('✗ ' + line) : c.greenBold('✓ ' + line)}`);
        if (s.falseGreen) write(`    ${c.dim('Why, and how to fix:')} ${c.cyan(`${DOCS}#${s.blind[0]}`)}`);
      }
      write();
    },
  };
}
