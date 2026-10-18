# Pre-existing work: disclosure

The hackathon rules ask entrants to disclose any pre-existing code or work incorporated into the project. This page lists all of it.

## Code: none pre-existing

Every line of code in this repository was written during the submission period (2026-09-22 to 2026-10-26). The git history starts on 2026-10-18 with the planning documents, followed by the implementation. That covers:

- the CLI
- the engine
- the twelve mutators
- the reporters
- the bench and its reference guards
- the fixtures and the fixture generator
- the tests
- the demo

No code was copied from any other project, public or private. The project has zero runtime dependencies.

## Ideas: generalized from the author's private incident notes

The twelve failure families in [FAILURE_MODES.md](FAILURE_MODES.md) are not invented for this hackathon.

- They come from the author's own written incident notes about a private automated content pipeline, recorded between July and September 2026.
- Those notes are prose post-mortems: symptom, why the check looked green, fix. **They are not code.** Nothing from that pipeline's code, file paths, data or product names is included here.
- Each entry's **Origin** line gives the date of the incident it generalizes.

In short: the corpus of failure modes existed before the submission period. Turning it into something executable (mutators that reproduce each family against any guard, a self-testing engine, and a bench with known answers) was done during the submission period.

## Tools

| Tool | Role |
|---|---|
| [Devpost Learn Skill Pack](https://github.com/challengepost/learn-ai-basics) (`npx skills add challengepost/learn-ai-basics --all -y`) | Installed into `.agents/skills/`. Its skills produced the planning documents in [`devpost/`](devpost/): `scope.md`, `prd.md`, `spec.md` and `checklist.md`. |
| Claude Code | The coding agent used to plan and build the project, as the rules expect. |
| Node.js ≥ 20 | Runtime. Built-in modules only. |
