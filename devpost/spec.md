---
doc: spec
status: approved
---

# falsegreen — Technical Spec

## How This Works, In Plain Language
falsegreen is a small Node program with four pieces:

1. **The guard runner** starts your guard command in a shell with a file path filled in and reads one thing back: the exit code.
2. **The mutators** are twelve small functions. Each one takes the bytes of a good artifact and returns a broken copy that still *looks* fine (same format, similar size, still parses). Each also carries a self-check that answers "did I really break it the way I claim?"
3. **The engine** runs the guard once on the clean artifact (baseline), then for each mutator: mutate → self-check → run the guard on the mutant → decide `CAUGHT`, `FALSE GREEN`, `INCONCLUSIVE` or `NOT APPLICABLE`.
4. **The reporters** turn the list of results into a terminal table, JSON, or Markdown.

`bench` is the same engine looped over a folder of fixtures with known answers. Nothing is stored between runs, nothing talks to the network, and there are no npm dependencies — so the tool runs anywhere Node 20+ runs.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. `bin/falsegreen.js` → `src/cli.js` parses arguments.
2. `src/formats.js` reads the artifact and detects its format (extension first, then content sniffing).
3. `src/engine.js#runGuardOnArtifact` → `src/guard.js#runGuard` executes the baseline. Exit ≠ 0 → every mutator gets `INCONCLUSIVE`.
4. For each mutator from `src/mutators/index.js`: `applies()` → `mutate()` → byte-diff + `verify()` self-check → write `.fg-<id>-<name>` beside the artifact → `runGuard` → verdict → delete mutant.
5. Results flow to `src/report/terminal.js`, `json.js` or `markdown.js`; `src/cli.js` sets the exit code.

## Stack
- **Node.js ≥ 20, ES modules, zero runtime dependencies** — the guard can be in any language; falsegreen should install nowhere and break nothing. Docs: https://nodejs.org/api/
- `node:child_process.spawnSync` with `shell: true` for guards. https://nodejs.org/api/child_process.html
- `node:test` + `node:assert` for tests. https://nodejs.org/api/test.html
- `node:crypto` for SHA-256, `TextDecoder('utf-8', { fatal: true })` for strict UTF-8 checks.

## Where It Runs and How Someone Tries It
- Local CLI. `node bin/falsegreen.js <command>` from a clone, `npx github:kimdooo-a/falsegreen <command>` without cloning (it is not published to the npm registry), or `npm link` to get the `falsegreen` binary.
- Demo for recording: `node examples/demo.mjs` (≤ 30 s, 80–100 columns).
- Tests: `node --test`.
- No API keys, no deployment.

## Look and Feel
Terminal only. Aligned columns, two-space indent, a dim rule line under headers. Colour via ANSI only when stdout is a TTY and `NO_COLOR` is unset (`FORCE_COLOR=1` forces it, for recordings). Red = FALSE GREEN, green = CAUGHT, yellow = INCONCLUSIVE, dim = NOT APPLICABLE. ASCII-safe symbols (`✓ ✗ ? ·`).

## Components

### CLI
`src/cli.js`. Commands `run`, `bench`, `list`, `--help`, `--version`. Flags: `--guard`, `--artifact`, `--mutators`, `--json`, `--report`, `--timeout`, `--verbose`. Exit codes 0/1/2.
PRD ref: `prd.md > Running a guard against mutants`, `prd.md > Reports`.

### Guard runner
`src/guard.js#runGuard(command, artifactPath, { timeoutMs, cwd })` → `{ exitCode, signal, timedOut, ms, stdout, stderr }`. Replaces every `{artifact}` with a double-quoted path (appends it if no placeholder).
PRD ref: `prd.md > Running a guard against mutants`.

### Format detection
`src/formats.js#detectFormat(path, bytes)` → `text | markdown | json | csv | svg | wav | unknown`.

### Mutator contract
`src/mutators/<family>.js` exports:
```js
{ id, title, formats: [...], summary,
  applies(ctx) -> { ok: true } | { ok: false, reason },
  mutate(ctx)  -> { bytes: Buffer, note: string, data?: any },
  verify(ctx, mutation) -> { ok: boolean, reason: string } }
```
`ctx = { path, dir, name, format, bytes, text }`. `src/mutators/index.js` holds the ordered registry.
PRD ref: `prd.md > Mutator catalogue`.

### Engine
`src/engine.js#run({ artifactPath, guard, mutators, timeoutMs })` → `{ artifact, guard, baseline, results[], summary }`. Owns the three-state rule: baseline gate, byte-diff gate, `verify()` gate. Cleans mutants in `finally` and on `SIGINT`.
PRD ref: `prd.md > The three-state self-test`.

### Reporters
`src/report/terminal.js`, `src/report/json.js`, `src/report/markdown.js`.
PRD ref: `prd.md > Reports`.

### Bench
`src/bench.js` walks `bench/fixtures/*/expected.json`, runs the engine for the fixture's family against each guard, and compares with expectations. Reference guards: `bench/guards/naive.mjs` (exists / non-empty / parses) and `bench/guards/hardened.mjs` (format-aware checks, conventions documented in its header).
PRD ref: `prd.md > Bench`.

## Data Model
In-memory only. A result:
```js
{ mutator, title, verdict: 'CAUGHT'|'FALSE_GREEN'|'INCONCLUSIVE'|'NOT_APPLICABLE',
  reason, note, guard: { exitCode, ms } | null, bytesBefore, bytesAfter }
```
`expected.json`: `{ "family", "artifact", "expect": { "naive": "...", "hardened": "..." } }`.

## File Structure
```
falsegreen/
├── bin/falsegreen.js          # executable entry (shebang)
├── src/
│   ├── cli.js                 # argument parsing, commands, exit codes
│   ├── engine.js              # baseline → mutate → self-test → guard → verdict
│   ├── guard.js               # run a shell command, read the exit code
│   ├── formats.js             # format detection
│   ├── verdicts.js            # verdict constants
│   ├── util.js                # sha256, strict utf-8, front matter, JSON walk, WAV parse
│   ├── bench.js               # fixture runner
│   ├── mutators/              # one file per failure family + index.js registry
│   └── report/                # terminal.js, json.js, markdown.js, color.js
├── bench/
│   ├── fixtures/<family>/     # clean artifact + expected.json (12)
│   └── guards/                # naive.mjs, hardened.mjs
├── examples/
│   ├── demo.mjs               # 30-second recorded demo
│   └── report/                # demo artifact + a realistic hand-written guard
├── test/                      # node --test suites
├── devpost/                   # scope.md, prd.md, spec.md, checklist.md, app-map.html
├── FAILURE_MODES.md
├── PREEXISTING.md
├── README.md
└── LICENSE
```

## External Services and Dependencies
None. No network calls.

## Important Failure Modes
- **Guard command quoting differs between shells (cmd.exe vs sh)** → paths are always double-quoted, which both accept; tests run on the host shell.
- **A mutant left behind after a crash** → `.fg-` prefix is git-ignored and the engine deletes mutants in `finally` and on SIGINT.
- **Approximate checks in the hardened reference guard** (text width estimate, font allowlist) → documented as approximations; the reference guard demonstrates the *kind* of check, not a renderer.

## What Was Simplified and Why
- **SVG geometry is estimated** (text width ≈ characters × font-size × 0.6) instead of measured in a browser — zero dependencies. A production guard should measure in its real renderer.
- **Fonts are checked against an allowlist** instead of the installed font list — reproducible across machines.
- **WAV only for audio** (16-bit PCM) instead of AAC/MP4 containers — writable with zero dependencies, same failure mechanism (a silent tail changes the measured length).

## Decisions and Open Issues
- Black-box guard via exit code (author's choice) — maximum reach; the tradeoff is no per-check detail from the guard.
- Mutants beside the artifact (author's choice) — keeps relative references valid; the tradeoff is brief writes into the artifact's folder.
- One genuine uncertainty: *can a mutator "fail silently" the way guards do?* Resolved by design — every mutator ships a `verify()` that must confirm the defect, and a test runs a no-op mutator to prove it yields `INCONCLUSIVE`.
- Planning interviews were answered from the author's written design brief (asynchronous); no open questions carried from `prd.md`.
