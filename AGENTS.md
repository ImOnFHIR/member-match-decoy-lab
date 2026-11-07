# Agent instructions: member-match-decoy-lab

Codex reads this file directly. Claude Code reads it through a local `CLAUDE.md` (not committed) that imports it.

## What this repo is
Synthetic Da Vinci HRex `$member-match` requests, each with a planted look-alike member ("decoy") or consent problem, run against several matchers. The scorer reports who found the right person, who rightly refused, and who matched the wrong person. It is also exposed as one read-only MCP tool, `score_member_match`. See `README.md`, `DECOYS.md` and `REMAINING_WORK.md`.

Maintainer-private context (plans, dates, budgets) lives in the maintainer's own agent primer, loaded from user-level config. Never write it into this repo.

## Rules
- **Synthetic data only.** No real people, addresses or identifiers. Every fixture passes `npm run leak:check` before commit.
- **Secrets:** never open `.env*`, `.dev.vars`, keys or credential files. If you see a secret, stop and tell the maintainer the file path; never copy the value.
- No names of real people from the standards community.
- `DECOYS.md` is the maintainer's design. Each decoy has its trap and its correct answer; don't change one without asking.
- The ground-truth manifest is digest-locked. Don't edit `manifest/` or `decoys/` without rebuilding and checking the lock.
- Deterministic matchers make no network calls. The LLM matcher calls only the model API, and `npm run spend:check` runs before any run that calls it.
- Code copied from another repo carries a provenance note.

## Working with the maintainer
- The maintainer works by voice. Keep messages short and phone-readable, and end with numbered yes/no questions. Never ask them to type a path or long text.
- For anything larger than a small fix, propose the next task and wait for a yes.

## Two agents, one repo
- Claude Code and Codex may both edit.
- **One agent per checkout at a time.** Each works on its own branch, cut from an up-to-date `main`.
- Whoever didn't write a change reviews it before the PR. Codex reviews Claude Code's changes with `codex review`; Claude Code reviews Codex's.

## Before you end a session
1. `npm run format`. You write files directly, so nothing formats them unless you run this.
2. `npm run lint`. Fix findings in files you touched; don't mass-fix unrelated files.
3. Run the validation commands below. All must pass.
4. Add a dated section at the top of `REMAINING_WORK.md`: what's done, what remains, deviations, test results.
5. Commit on your branch and open a PR.

## Validation
```
npm run format:check && npm run lint
npm test                          # builds, then runs every test
npm run decoys:lint && npm run leak:check
npm run manifest:check
npm run validate:fhir             # needs .tools/validator_cli.jar once: npm run validator:get
```
`npm run score` prints the scoreboard. If the LLM matcher is enabled it calls the model API, so run `npm run spend:check` first.

## Preview
- `npm run console`: the dev console UI for building and testing the MCP tool
- `npm run serve`: the local `$member-match` endpoint on 127.0.0.1:8650
- `npm run report`: writes the scoreboard page; open `report/scoreboard.html`

In VS Code, every command above is a task: Terminal → Run Task.
