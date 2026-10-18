---
doc: prd
status: approved
---

# falsegreen — Product Requirements

A command-line tool for developers who put a "verify" step in an automated pipeline: it attacks their guard with deliberately broken artifacts and reports which failure families the guard cannot see.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`.

1. The user has one artifact their pipeline produced and believes is correct, and a guard command that checks it (any language; it only has to exit 0 for pass and non-zero for fail).
2. They run `falsegreen run --guard "<command with {artifact}>" --artifact <path>`.
3. falsegreen prints what it is about to test: the artifact, its detected format, and the guard command.
4. **Baseline.** falsegreen runs the guard on the untouched artifact. If the guard does not exit 0, every result is `INCONCLUSIVE` and the run stops with an explanation (a guard that rejects good input proves nothing about bad input).
5. **Mutation.** For each mutator in the catalogue, falsegreen decides if it applies to this format and content. If not → `NOT APPLICABLE` with the reason. If it applies, it writes a mutant file next to the artifact and **self-tests the mutation**: the bytes must differ and the mutator's own semantic check must confirm the intended defect really exists. If not → `INCONCLUSIVE`.
6. **Verdict.** The guard runs on the mutant. Non-zero exit → `CAUGHT`. Exit 0 → `FALSE GREEN`. Timeout or crash-by-signal → `INCONCLUSIVE`.
7. The table ends with *"Your guard is blind to N of M failure families"* and a pointer to the `FAILURE_MODES.md` entry for the first blind family.
8. The user fixes the guard and re-runs until every applicable row is `CAUGHT`. The exit code lets CI enforce it.

## Screens and Layout
A terminal interface with three commands:

- `falsegreen run` — the core journey above.
- `falsegreen bench` — evaluates the two reference guards (and optionally the user's own guard) over the bench fixtures, prints a coverage table and checks each result against the fixture's expected verdict.
- `falsegreen list` — prints the 12 families with their supported formats and a one-line description.

Output fits an 80–100 column terminal.

## Look and Feel
- Reads like a test runner: a short header, an aligned table, a one-line verdict at the bottom.
- Colour carries meaning only: red = `FALSE GREEN`, green = `CAUGHT`, yellow = `INCONCLUSIVE`, dim = `NOT APPLICABLE`. Respects `NO_COLOR` and non-TTY output.
- Every row says, in a few words, **what was broken** ("12 strings → template text, size ±2%").
- Plain, precise English. No emoji.

## Features and Behavior

### Running a guard against mutants
- As a pipeline developer, I want to point falsegreen at my existing guard command without modifying it, so that I can test the guard I actually ship.
  - [ ] `{artifact}` in the guard command is replaced with the quoted mutant path; if absent, the path is appended.
  - [ ] Only the exit code is read; stdout/stderr of the guard are captured and shown only with `--verbose`.
  - [ ] `--mutators a,b` limits the run to those families; unknown names are a usage error.
  - [ ] A per-guard timeout (`--timeout`, default 30 s) turns a hung guard into `INCONCLUSIVE`.
  - [ ] Mutant files are removed after the run, including on Ctrl-C.

### The three-state self-test
- As a user, I want falsegreen to never report a false green that it caused itself, so that I can trust its red.
  - [ ] Baseline failure → all results `INCONCLUSIVE`, exit code 2.
  - [ ] A mutator that leaves the bytes unchanged → `INCONCLUSIVE` ("mutation did not change the artifact").
  - [ ] A mutator whose semantic check fails (e.g. the "dead regex" still matches) → `INCONCLUSIVE` with the check's reason.
  - [ ] A mutator that cannot apply to the format or content → `NOT APPLICABLE` with the reason.

### Mutator catalogue
Twelve families, each reproducing a documented failure: `empty-input`, `placeholder-as-content`, `occlusion`, `overflow`, `declared-vs-rendered`, `metadata-identity`, `stale-cache`, `numeric-truncation`, `dead-regex`, `silent-track`, `self-referential-check`, `structured-overrides-body`. Each declares the formats it supports (text, Markdown, JSON, CSV, SVG, WAV).
  - [ ] `falsegreen list` shows all 12 with formats.
  - [ ] Each family has a `FAILURE_MODES.md` entry: Symptom / Why it looked green / Reproduce / Fix / Origin.

### Reports
- As a user, I want the result in the form my workflow needs.
  - [ ] Default: coloured terminal table.
  - [ ] `--json`: one JSON document on stdout, nothing else.
  - [ ] `--report out.md`: a Markdown report with the table and one section per false green, linking to `FAILURE_MODES.md`.
  - [ ] Exit code: 0 = no false greens, 1 = at least one false green, 2 = inconclusive baseline or usage error.

### Bench
- As a guard author, I want a fixed set of fixtures with known answers, so that I can score any guard.
  - [ ] One fixture directory per family with a clean artifact and `expected.json` (expected verdict for the naive and hardened reference guards).
  - [ ] `falsegreen bench` prints a family × guard table, coverage per guard, and `expectations met: X/Y`.
  - [ ] `falsegreen bench --guard "<cmd>"` adds a column for the user's guard.

## States and Boundaries
- **First use** — `falsegreen` with no arguments prints usage and the three commands.
- **Guard rejects the clean artifact** — all `INCONCLUSIVE`, a message explaining why, exit 2.
- **No mutator applies** — table of `NOT APPLICABLE`, summary "0 families tested", exit 2 (nothing was proven).
- **Artifact missing / unreadable** — usage error, exit 2.
- **Persistence** — nothing persists; mutants are temporary files deleted at the end.

## Product Decisions
- The guard is a black box read by exit code only — so any language and any existing script works unmodified.
- Mutants are written next to the original artifact (hidden `.fg-` prefix) rather than in a temp folder — so relative references (manifests, links) resolve the same way they do for the real artifact.
- `INCONCLUSIVE` is a first-class verdict, not an error — a harness that reports its own no-ops as findings commits the very failure it hunts.
- Bench numbers are printed as measured; expectations are checked, never assumed.

## What We're Building
Everything under **Features and Behavior**, the bench fixtures, two reference guards, `FAILURE_MODES.md`, a README, and a ≤30 s demo script.

## Deferred From the POC
- Office/PDF/video formats — need zip/OLE/container writers; the families are format-independent and are demonstrated on the formats we can mutate with zero dependencies.
- Rendering-accurate checks (real font availability, real text bounding boxes) — belong in the user's guard; the reference hardened guard uses documented approximations.

## Possible Later Enhancements
A mutator plugin API; a GitHub Action; HTML report; mutating a whole output directory at once.

## Non-Goals
- Fixing the user's guard automatically.
- Judging whether an artifact is good — falsegreen only judges the guard.
- Hiding AI involvement or scrubbing authorship — the `metadata-identity` family *detects* leaks; it is not an anonymiser.

## Open Questions
None blocking.
