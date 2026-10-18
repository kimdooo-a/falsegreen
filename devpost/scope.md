---
doc: scope
status: approved
---

# falsegreen

Mutation testing for the guards in your pipeline: break a known-good artifact on purpose, hand it to your guard, and report every time the guard still says "pass".

## The Unique Kernel
Code has mutation testing; **verification steps do not.** `falsegreen` mutates the *artifact*, not the code, and treats the guard as a black box that only answers with an exit code. Every mutator reproduces a real failure family that once slipped past a green check. And the harness refuses to lie about itself: if a mutation did not actually break anything, the verdict is `INCONCLUSIVE`, never a fake "false green".

## Who It's For
A developer who runs an AI agent or an automation pipeline with a "verify" step: a script that checks the generated report, slide, dataset, or audio file before it ships. Today they test that guard (if at all) with the happy path: one good file goes in, the guard exits 0, done. Nobody feeds it broken-but-plausible files.

## The Core Loop
1. Point `falsegreen run` at one good artifact and the guard command (`--guard "python verify.py {artifact}"`).
2. It checks the guard accepts the clean file, then applies every applicable mutator, runs the guard on each mutant, and prints a coverage table.
3. The user hardens the guard for each `FALSE GREEN` row (each row links to a write-up), re-runs, and watches the rows turn `CAUGHT`.

They come back whenever the guard or the artifact format changes, or wire it into CI (non-zero exit on any false green).

## Inspiration & Identity
- Mutation testing tools: Stryker (https://stryker-mutator.io/), PIT (https://pitest.org/) — the "mutant survived" idea, applied to artifacts.
- Tone: a calm, precise lab instrument. The terminal report should look like a test runner, not a toy. Red is reserved for one thing: a guard that passed something broken.

## Why This Matters to the Learner
The author's own pipeline failed green again and again over several months: guards ran, printed "passed", and the artifact was missing what mattered. Each incident was written down. This turns those notes into a weapon anyone can aim at their own guards.

## What "Working" Looks Like
In a terminal: run `falsegreen run` against a realistic hand-written guard and a JSON report → a table with several `FALSE GREEN` rows and the line *"Your guard is blind to N of M failure families"*. Run the same artifact against a hardened guard → every row `CAUGHT`. Then `falsegreen bench` prints a side-by-side coverage score of a naive and a hardened reference guard over 12 fixtures.

The "oh, that's cool" beat: a guard you would have shipped turns out to accept a report whose content is entirely `Lorem ipsum`.

## The POC Boundary
- One CLI (`run`, `bench`, `list`), Node only, zero runtime dependencies.
- Mutators for the 12 failure families, over text, Markdown, JSON, CSV, SVG and WAV.
- Three-state self-test (baseline → did the mutation really happen → verdict).
- Terminal, JSON and Markdown reports.
- A bench of 12 fixtures with expected verdicts and two reference guards.
- `FAILURE_MODES.md` with one entry per family.

## Later
- Binary office formats (DOCX/PPTX/HWPX/PDF) and video containers.
- A pluggable mutator API for third-party families.
- A GitHub Action wrapper.

## Explicitly Cut
- Web dashboard / UI — the product is a CLI; the terminal report is the interface.
- Rendering-based checks inside falsegreen itself (headless browser, font rasterization) — falsegreen only mutates; measuring rendered output is the guard's job.
- Hosted service — nothing to host; it runs where the guard runs.
- Auto-fixing the user's guard — the tool reports blindness; writing the check stays with the human.
