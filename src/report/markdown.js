// Markdown report for pull requests, CI artifacts and issue threads.
import { basename } from 'node:path';
import { familyNumber } from '../mutators/index.js';
import { FALSE_GREEN, INCONCLUSIVE, NOT_APPLICABLE, LABEL } from '../verdicts.js';

const esc = (s) => String(s ?? '').replace(/\|/g, '\|').replace(/\r?\n/g, ' ');
const DOCS = 'FAILURE_MODES.md';

export function toMarkdown(result, version, { docsBase = DOCS } = {}) {
  const { artifact, guard, baseline, results, summary: s } = result;
  const L = [];
  L.push(`# falsegreen report`, '');
  L.push(`| | |`, `|---|---|`);
  L.push(`| Artifact | \`${esc(basename(artifact.path))}\` (${artifact.format}, ${artifact.bytes} bytes, sha256 \`${artifact.sha256.slice(0, 12)}…\`) |`);
  L.push(`| Guard | \`${esc(guard)}\` |`);
  L.push(`| Baseline | ${baseline.ok ? `accepted the clean artifact (exit 0, ${baseline.ms} ms)` : `**rejected the clean artifact (${esc(baseline.detail)})** — nothing below is proven`} |`);
  L.push(`| Tool | falsegreen ${version} |`, '');

  if (!s.baselineOk || s.tested === 0) {
    L.push(`> **Nothing was proven.** ${!s.baselineOk ? 'The guard rejects the clean artifact.' : 'No failure family applied to this artifact.'}`, '');
  } else {
    L.push(`> **Your guard is blind to ${s.falseGreen} of ${s.tested} failure families.**`, '');
  }
  L.push(`${s.tested} tested · ${s.caught} caught · ${s.falseGreen} false green · ${s.inconclusive} inconclusive · ${s.notApplicable} n/a`, '');

  L.push(`| # | Failure family | Verdict | What was broken / why not tested |`, `|---|---|---|---|`);
  for (const r of results) {
    const what = r.verdict === NOT_APPLICABLE || r.verdict === INCONCLUSIVE ? r.reason : r.note;
    const v = r.verdict === FALSE_GREEN ? `**${LABEL[r.verdict]}**` : LABEL[r.verdict];
    L.push(`| ${familyNumber(r.mutator)} | [${r.mutator}](${docsBase}#${r.mutator}) | ${v} | ${esc(what)} |`);
  }
  L.push('');

  const fg = results.filter((r) => r.verdict === FALSE_GREEN);
  if (fg.length) {
    L.push(`## False greens`, '');
    for (const r of fg) {
      L.push(`### ${r.mutator}`, '');
      L.push(`- **What was broken:** ${r.note}`);
      L.push(`- **Self-test:** ${r.reason}`);
      L.push(`- **Guard:** exited ${r.guard?.exitCode} in ${r.guard?.ms} ms`);
      L.push(`- **Why it looks green and how to fix it:** [${docsBase}#${r.mutator}](${docsBase}#${r.mutator})`, '');
    }
  }
  return L.join('\n');
}
