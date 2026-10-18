# falsegreen

**Mutation testing for the guards in your pipeline.**
falsegreen breaks a known-good artifact on purpose, hands it to your verify step, and reports every time the verify step still says *pass*. That pass is a **false green**.

```
npx github:kimdooo-a/falsegreen run --guard "python verify.py {artifact}" --artifact out/report.json
```

## The problem

If you run an AI agent or any automated pipeline, you probably have a guard: a script that checks the generated report, slide, dataset or audio file before it ships. When that guard fails, the failure rarely shows up as red. It shows up as **green**:

- the guard runs and prints `passed`
- the file opens normally
- but something that should be in it is missing

The file has placeholder text instead of content. An empty list passes "every item is valid". A summary field says 3 items while the body holds 1.

Code has mutation testing. Verify steps usually don't. **Nobody feeds their guard broken-but-plausible files.** falsegreen does exactly that, using twelve failure families taken from real incidents ([FAILURE_MODES.md](FAILURE_MODES.md)).

## What it looks like

A careful, hand-written guard ([`examples/report/verify-report.mjs`](examples/report/verify-report.mjs)) checks required fields, the item count, every item's text, number types, and that each attachment exists on disk:

```
$ falsegreen run --guard "node examples/report/verify-report.mjs {artifact}" --artifact examples/report/report.json

  falsegreen 0.1.0  mutation testing for the guards in your pipeline

  artifact  examples/report/report.json  (json, 997 B)
  guard     node examples/report/verify-report.mjs {artifact}
  baseline  ✓ guard accepts the clean artifact (exit 0, 66 ms)

  #   FAILURE FAMILY             VERDICT        WHAT WE BROKE
  ────────────────────────────────────────────────────────────────────────────────────────────────
  01  empty-input                ✗ FALSE GREEN  3 elements → []; every key kept
  02  placeholder-as-content     ✗ FALSE GREEN  7 fields → template text, size -0.5%
  03  occlusion                  · n/a          needs svg
  04  overflow                   · n/a          needs svg
  05  declared-vs-rendered       ✗ FALSE GREEN  re-encoded Latin-1: 4 chars now read as U+FFFD
  06  metadata-identity          ✗ FALSE GREEN  _meta: user jdoe, host, home path
  07  stale-cache                ✗ FALSE GREEN  items edited; content_sha256 kept
  08  numeric-truncation         ✗ FALSE GREEN  2150000000 → 2.2E+09 (top 1 of 3)
  09  dead-regex                 · n/a          no "pattern"/"regex" fields in this JSON
  10  silent-track               · n/a          needs wav
  11  self-referential-check     ✓ CAUGHT       charts/ports.svg → ports.final.svg (missing)
  12  structured-overrides-body  ✗ FALSE GREEN  items 3 → 1; item_count still 3
  ────────────────────────────────────────────────────────────────────────────────────────────────
  8 tested · 1 caught · 7 false green · 0 inconclusive · 4 n/a

  ✗ Your guard is blind to 7 of 8 failure families.
    Why, and how to fix: FAILURE_MODES.md#empty-input
```

Run the same report against [`bench/guards/hardened.mjs`](bench/guards/hardened.mjs), which checks the content instead of trusting its labels, and all 8 tested rows come back `✓ CAUGHT`.

To see the whole story in about 20 seconds, run `node examples/demo.mjs`. It is scripted for screen recording at 80–100 columns.

## Install

You need Node.js 20 or newer. falsegreen has no dependencies.

```sh
git clone https://github.com/kimdooo-a/falsegreen && cd falsegreen
node bin/falsegreen.js --help        # or: npm link && falsegreen --help
node --test                          # 43 tests
node bin/falsegreen.js bench         # reference guards over 12 fixtures
```

## Connect your guard

A **guard** is any shell command that checks one file and answers with its exit code: `0` means pass, anything else means fail. falsegreen never reads the guard's output, so your guard can be in any language and needs no changes.

```sh
# {artifact} is replaced with the (quoted) path of each mutant; if absent, the path is appended.
falsegreen run --guard "python scripts/verify.py {artifact}"            --artifact out/report.json
falsegreen run --guard "jq -e '.items | length > 0' {artifact}"         --artifact out/report.json
falsegreen run --guard "npm run --silent verify:slides -- {artifact}"   --artifact out/cover.svg
falsegreen run --guard "./check-audio.sh {artifact}" --mutators silent-track,metadata-identity --artifact out/vo.wav
```

| Option | |
|---|---|
| `--artifact <path>` | One **known-good** artifact your pipeline produced. |
| `--mutators a,b` | Run only these families (`falsegreen list` shows all 12). |
| `--json` | Print one JSON document instead of the table. |
| `--report out.md` | Also write a Markdown report, handy as a CI artifact or PR comment. |
| `--timeout <sec>` | Per-guard timeout (default 30). A hung guard is `INCONCLUSIVE`. |
| `--verbose` | Show the self-test reason and the guard's first line of output for each row. |

**Exit codes, for CI:**

- `0`: no false greens.
- `1`: at least one false green.
- `2`: nothing was proven (the baseline failed, nothing applied, or a usage error).

```yaml
# .github/workflows/guards.yml (excerpt)
- run: npx github:kimdooo-a/falsegreen run --guard "node scripts/verify.mjs {artifact}" --artifact fixtures/good-report.json --report falsegreen.md
```

Mutants are written **next to** the artifact, as hidden `.fg-<family>-<name>` files, and deleted right after each guard run, including on Ctrl-C. This placement keeps relative references (manifests, Markdown links) resolving exactly as they do for the real artifact.

## Three verdicts, plus "not applicable"

A harness that reports its own no-ops as findings commits the very failure it hunts. So three gates stand between a mutator and a `FALSE GREEN`:

1. **Baseline.** The guard must accept the clean artifact. If it does not, every result is `INCONCLUSIVE`: a guard that fails good input proves nothing about bad input.
2. **Bytes.** The mutant must differ from the original. If it does not, the result is `INCONCLUSIVE`.
3. **Self-test.** Each mutator ships a `verify()` that reads the mutant back and confirms the defect is really there. For example, the dead regex really stops matching its examples, and the appended audio really is digital silence. If the check fails, the result is `INCONCLUSIVE`.

| Verdict | Meaning |
|---|---|
| `✓ CAUGHT` | The guard exited non-zero on a confirmed defect. Good. |
| `✗ FALSE GREEN` | The guard exited 0 on a confirmed defect. |
| `? INCONCLUSIVE` | Nothing was proven: the baseline failed, the mutation was a no-op or failed its self-test, or the guard hung or crashed. |
| `· n/a` | The family does not apply to this format or content. The row says why. |

The test suite proves these gates work. It runs a no-op mutator, a lying mutator and a crashing mutator, and requires `INCONCLUSIVE` for all three. It also hands every real mutator's `verify()` the *unmutated* artifact and requires a rejection. That test caught a bug during the build: `dead-regex` was trusting its own list of patterns instead of reading the mutant back.

## The twelve failure families

| # | Family | What falsegreen does | Formats |
|---|---|---|---|
| 01 | [empty-input](FAILURE_MODES.md#empty-input) | Keeps the structure and removes the content (`[]`, header-only CSV, 0 audio frames) | text md json csv svg wav |
| 02 | [placeholder-as-content](FAILURE_MODES.md#placeholder-as-content) | Swaps prose for template text of the same length | text md json csv svg |
| 03 | [occlusion](FAILURE_MODES.md#occlusion) | Draws an opaque shape over the text, after it | svg |
| 04 | [overflow](FAILURE_MODES.md#overflow) | Pushes a line past the edge of the canvas | svg |
| 05 | [declared-vs-rendered](FAILURE_MODES.md#declared-vs-rendered) | Declares an unavailable font / re-encodes UTF-8 as Latin-1 | svg text md csv json |
| 06 | [metadata-identity](FAILURE_MODES.md#metadata-identity) | Plants a username and home path in metadata; the body stays clean | svg md json wav |
| 07 | [stale-cache](FAILURE_MODES.md#stale-cache) | Changes content and keeps its digest/ETag | json md |
| 08 | [numeric-truncation](FAILURE_MODES.md#numeric-truncation) | Writes the largest values as `2.2E+09` | csv json |
| 09 | [dead-regex](FAILURE_MODES.md#dead-regex) | Wraps rule patterns in `\b…\b` / `^…$` so they can't match | json |
| 10 | [silent-track](FAILURE_MODES.md#silent-track) | Appends digital silence | wav |
| 11 | [self-referential-check](FAILURE_MODES.md#self-referential-check) | Points a manifest entry at a missing file; its status fields still say ok | json md |
| 12 | [structured-overrides-body](FAILURE_MODES.md#structured-overrides-body) | Cuts the body and keeps the summary count | json md |

All twelve are implemented. Each one's `applies()` also checks the *content*: a JSON file with no digest field gets `n/a` for `stale-cache`, not a fake mutation.

## The bench (evals)

[`bench/fixtures/<family>/`](bench/fixtures) holds one clean artifact per family plus an `expected.json` with the expected verdict for each reference guard. Fixtures are generated by [`bench/make-fixtures.mjs`](bench/make-fixtures.mjs), so digests, totals and the WAV signal are computed rather than typed by hand.

```
$ falsegreen bench

  falsegreen bench 0.1.0  12 fixtures × 2 guards

  #   FAILURE FAMILY             FIXTURE             naive          hardened
  ────────────────────────────────────────────────────────────────────────────────────────────────
  01  empty-input                answers.json        ✗ FALSE GREEN  ✓ CAUGHT
  02  placeholder-as-content     summary.md          ✗ FALSE GREEN  ✓ CAUGHT
  03  occlusion                  slide.svg           ✗ FALSE GREEN  ✓ CAUGHT
  04  overflow                   title-card.svg      ✗ FALSE GREEN  ✓ CAUGHT
  05  declared-vs-rendered       poster.svg          ✗ FALSE GREEN  ✓ CAUGHT
  06  metadata-identity          badge.svg           ✗ FALSE GREEN  ✓ CAUGHT
  07  stale-cache                catalog.json        ✗ FALSE GREEN  ✓ CAUGHT
  08  numeric-truncation         ledger.csv          ✗ FALSE GREEN  ✓ CAUGHT
  09  dead-regex                 rules.json          ✗ FALSE GREEN  ✓ CAUGHT
  10  silent-track               narration.wav       ✗ FALSE GREEN  ✓ CAUGHT
  11  self-referential-check     manifest.json       ✗ FALSE GREEN  ✓ CAUGHT
  12  structured-overrides-body  field-report.md     ✗ FALSE GREEN  ✓ CAUGHT
  ────────────────────────────────────────────────────────────────────────────────────────────────
  coverage (caught / tested)                         0/12 0%        12/12 100%
  expectations met: 24/24   (bench/fixtures/*/expected.json)

  Naive guard: blind to 12 of 12 families.  Hardened guard: blind to 0 of 12.
```

The **naive** guard checks what most verify steps check: the file exists, is not empty, and parses. The **hardened** guard has one check per family, and each check asks the artifact or the disk instead of a field that only claims something. Its conventions are documented at the top of the file. Add `--guard "<your command>"` to score your own guard as a third column. Rows where your guard rejects a clean fixture show as `INCONCLUSIVE`, never as a pass.

`falsegreen bench` exits non-zero if any verdict differs from `expected.json`, so it also serves as falsegreen's own regression eval.

## Limitations

- **One artifact per run, single-file formats.** Supported: text, Markdown, JSON, CSV, SVG and 16-bit PCM WAV. Office documents, PDF and video containers are not mutated yet, though the families themselves apply to them.
- **The hardened reference guard approximates.** It estimates SVG text width as characters × font-size × 0.6 and checks fonts against a fixed allowlist. A production guard should measure in the renderer that actually ships the file. falsegreen itself only mutates and never needs a renderer.
- **Mutators are opinionated about conventions.** `stale-cache` looks for a `*sha256/digest/etag` field, and `structured-overrides-body` looks for `*_count` next to a matching array, or `sections`/`word_count` in front matter. Artifacts without those get `n/a` rather than a guess.
- **The guard is a black box.** You learn *which* family it misses, not *which line* of the guard is responsible.
- **Developed and tested on Windows (cmd.exe) with Node 24.** Paths are double-quoted, which POSIX shells also accept, but the suite has not been run on macOS or Linux CI yet.
- **The naive reference guard is deliberately minimal.** Its 0/12 shows what "exists and parses" catches. The more telling number is the realistic guard in the demo: 1 of 8.

## Project layout

```
bin/falsegreen.js        CLI entry
src/engine.js            baseline → mutate → self-test → guard → verdict
src/guard.js             runs your command, reads the exit code
src/mutators/            one file per failure family (+ index.js registry)
src/report/              terminal, JSON and Markdown reporters
src/bench.js             fixture runner
bench/fixtures/          12 clean artifacts with expected verdicts
bench/guards/            naive.mjs and hardened.mjs reference guards
examples/                demo.mjs and the weekly-report example
test/                    node --test suites (43 tests)
devpost/                 scope.md, prd.md, spec.md, checklist.md, app-map.html
```

## Built with Claude Code and the Devpost Learn Skill Pack

This project was built for **Build With AI: Basics** (Devpost).

- The [Devpost Learn Skill Pack](https://github.com/challengepost/learn-ai-basics) was installed with `npx skills add challengepost/learn-ai-basics --all -y` (it lives in `.agents/skills/`).
- The project followed the pack's skills in order: `1-start` → `2-scope` → `3-prd` → `4-spec` → `5-build`.
- The planning documents those skills produced are in [`devpost/`](devpost/): [`scope.md`](devpost/scope.md), [`prd.md`](devpost/prd.md), [`spec.md`](devpost/spec.md), and the build [`checklist.md`](devpost/checklist.md). The build went slice by slice from that checklist, with one commit per slice.
- **Claude Code** was the coding agent throughout.
- The failure-mode corpus predates the hackathon; see [PREEXISTING.md](PREEXISTING.md).

## License

[MIT](LICENSE) © 2026 kimdooo-a
