---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. One mutator end to end: a guard is caught passing placeholder text**
  Becomes usable: `node bin/falsegreen.js run --guard "<cmd>" --artifact x.md` runs a baseline, applies `placeholder-as-content`, runs the guard on the mutant and prints CAUGHT or FALSE GREEN.
  Why now: Proves the whole path (CLI → guard runner → mutator → verdict → table) with the kernel's most striking family first.
  PRD ref: `prd.md > The Core Journey` (steps 1-7), `prd.md > Running a guard against mutants`
  Spec ref: `spec.md > CLI`, `spec.md > Guard runner`, `spec.md > Engine`, `spec.md > File Structure`
  Build: Scaffold package.json/bin, guard runner with `{artifact}` substitution, format detection, engine with baseline gate, one mutator, terminal table.
  Verify (mechanical): Run against a guard that only checks non-emptiness (FALSE GREEN) and one that greps for "Lorem" (CAUGHT).
  Learner check: Run the command on a Markdown file with your own one-line guard and read the table.
  Commit: `Run a guard against a placeholder mutant end to end`

- [x] **2. The harness cannot lie: three-state self-test**
  Becomes usable: Baseline failure, unchanged bytes and failed semantic checks all report INCONCLUSIVE; non-applicable formats report NOT APPLICABLE.
  Why now: The kernel's credibility depends on it; every later mutator relies on `verify()`.
  PRD ref: `prd.md > The three-state self-test`
  Spec ref: `spec.md > Engine`, `spec.md > Mutator contract`
  Build: Byte-diff gate, `verify()` gate, timeout handling, mutant cleanup on SIGINT; tests including a no-op mutator.
  Verify (mechanical): `node --test` passes, including the no-op mutator → INCONCLUSIVE test.
  Learner check: Point the tool at a guard that always fails and read the explanation.
  Commit: `Add three-state self-test and core tests`

- [x] **3. All twelve failure families**
  Becomes usable: `falsegreen list` shows 12 families; `run` applies every mutator that fits the artifact's format.
  Why now: The catalogue is the product's substance; reporters and bench consume it.
  PRD ref: `prd.md > Mutator catalogue`
  Spec ref: `spec.md > Mutator contract`
  Build: Remaining 11 mutators over text/Markdown/JSON/CSV/SVG/WAV, each with `applies`, `mutate`, `verify`.
  Verify (mechanical): Unit tests per mutator: changes bytes, passes its own verify, refuses wrong formats.
  Learner check: Run `falsegreen list` and one `run` on an SVG.
  Commit: `Implement the twelve mutator families`

- [x] **4. Reports and exit codes**
  Becomes usable: `--json`, `--report out.md`, exit codes 0/1/2, "blind to N of M" summary line with a FAILURE_MODES link.
  Why now: Needed for CI use and for the bench.
  PRD ref: `prd.md > Reports`
  Spec ref: `spec.md > Reporters`
  Build: JSON and Markdown reporters, summary computation, exit-code mapping.
  Verify (mechanical): CLI tests parse `--json` output and assert exit codes.
  Learner check: Open the generated Markdown report.
  Commit: `Add JSON and Markdown reports and exit codes`

- [x] **5. Bench: naive vs hardened over 12 fixtures**
  Becomes usable: `falsegreen bench` prints a coverage comparison and checks every expected verdict.
  Why now: The demo's key scene and the evals deliverable.
  PRD ref: `prd.md > Bench`
  Spec ref: `spec.md > Bench`
  Build: 12 fixture folders, `naive.mjs`, `hardened.mjs`, `src/bench.js`, `--guard` column.
  Verify (mechanical): `falsegreen bench` exits 0 with all expectations met; a test asserts it.
  Learner check: Run `falsegreen bench` and read the two coverage numbers.
  Commit: `Add bench fixtures and reference guards`

- [x] **6. Demo and documentation**
  Becomes usable: `node examples/demo.mjs` tells the story in under 30 s; README, FAILURE_MODES.md and PREEXISTING.md explain the tool.
  Why now: Required for submission; written last so it describes what exists.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`
  Build: Demo artifact + realistic guard, demo script, docs.
  Verify (mechanical): Time the demo; check line widths ≤ 100; run the leak grep.
  Learner check: Run the demo and watch it end to end.
  Commit: `Add demo script and documentation`

## Hands-on Checkpoints

- [x] Early usable behavior explored — the author ran `node examples/demo.mjs` end to end while recording the demo video (2026-10-18); re-run 2026-10-25 from a fresh clone via `npx github:kimdooo-a/falsegreen`
- [x] Final kick-the-tires exploration and feedback completed — done while recording the demo video (2026-10-18)

## Final Review

- [x] Final review complete — 2026-10-25 pre-deadline review from a fresh clone: `node --test` 43/43, `falsegreen bench` 24/24 expectations met, example guard blind to 7 of 8, hardened guard blind to 0 of 8; the `npx` path in `spec.md` and the README audience line were corrected

## Code Tour and App Map

- [x] Learning activity complete — brief recap (familiar plan-first author)
- [x] Optional edit and transfer reflection addressed — not applicable (asynchronous build)
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: brief recap with the author; recap of the run path `src/cli.js` → `src/engine.js` → `src/guard.js`, evidenced by `test/engine.test.js`.
Route and stops: reference route in `devpost/app-map.html`.
Edit outcome: not applicable.
Reflection: not offered (asynchronous build).
Activity mode: recap.

## Revisions
- Note column and table widths were tightened after the demo measured 115 columns — the recording target is 80–100 columns (now max 80 at COLUMNS=80).
- `dead-regex` verify() read its own list instead of the mutant bytes — caught by the new "verify() must reject the unmutated artifact" test; fixed to parse the mutant.
- JSON and Markdown reporters landed in slice 1, not slice 4 — the CLI imports them at startup, so slice 4 became exit-code and report tests only.
