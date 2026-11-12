# member-match-decoy-lab

> **Synthetic data only; not a production matching recommendation.**

When one health plan asks another "who is this member?" (Da Vinci HRex `$member-match`), a wrong answer sends one person's records to someone else. This lab plants look-alike members and consent problems in synthetic requests, runs several ways of matching against them, and reports in plain English who found the right person, who rightly refused, and who sent records to the wrong person.

Status: v0 under construction (target 2026-12-02). Progress is in [REMAINING_WORK.md](REMAINING_WORK.md).

## What happened

**1 of 4 matchers sent someone's records to the wrong person: ID-first rules.** Given John Roe's details on Jon Roe's card, it trusted the card and sent Jon Roe's records.

| Matcher | Right | What it got wrong |
|---|---|---|
| Identity matcher, strict | 5 of 6 | Refused Rowan Quill Jr, who was the right answer (safe, but a miss) |
| Identity matcher, relaxed | 6 of 6 | |
| ID-first rules | 5 of 6 | **Sent Jon Roe's records in answer to a request for John Roe** |
| Check-every-field rules | 6 of 6 | |

See every answer on the [scoreboard page](report/scoreboard.html) (open it in a browser), or run `npm run score` for the same report in the terminal.

## The matchers

| Name | Id | What it does |
|---|---|---|
| Identity matcher, strict | `identity-strict` | Nick's event-sourced identity matcher (C-057) at its own setting: accepts a look-alike only when at least 90% sure; otherwise sends it to human review. |
| Identity matcher, relaxed | `identity-relaxed` | The same matcher, accepting a look-alike at a confidence you set: `RELAXED_CONFIDENCE=85` (75–100, default 85). |
| ID-first rules | `id-first` | Trusts the member or subscriber ID on the card; uses name, birth date and gender only to break ties. A common way to build member match. |
| Check-every-field rules | `check-every-field` | Finds the card's ID, then insists that name, birth date and gender all agree. |
| AI adjudicator, with rules | `ai-with-rules` | Claude reads the request and the member list, given the HRex matching rules. Costs a few cents per run. |
| AI adjudicator, rules and consent codes | `ai-with-definitions` | The same, plus HRex's own definitions of the two consent codes. |
| AI adjudicator, no rules | `ai-no-rules` | The same, told nothing about the HRex rules. |

### First AI run (2026-11-04, Claude Sonnet 5.5, one run each)

| AI version | Right | What went wrong |
|---|---|---|
| With rules | 3 of 6 | Read the consent code `#sensitive` as a restriction. Refused John Roe and Rowan Quill Jr although both consents were valid, and released John Roe's records under a `#regular` consent this plan can't honour. |
| Rules and consent codes | 5 of 6 | Still refused the clean control, reading "can't separate out sensitive data" as a reason it couldn't honour a share-everything consent. |
| No rules | 5 of 6 | Released John Roe's records under the `#regular` consent. |

No AI version sent records to the wrong person. The weak point is consent: the model doesn't know what HRex's two consent codes mean, and the rules alone made it more cautious in the wrong place. One run each is a small sample.

Each matcher checks consent itself; the endpoint doesn't help. The AI matchers default to Claude Sonnet 5.5; `LLM_MODEL=claude-opus-5-5` reruns them on Opus.

## The decoys

Six synthetic requests, each with a trap. Details and the spec text behind each right answer are in [DECOYS.md](DECOYS.md).

- **Control:** a clean request for John Roe. Everyone should find him.
- **Senior and Junior on one card:** same name, same card; only the birth date tells which Rowan is asking.
- **Twins on one policy:** same birth date, and the request gives only the initial A. The right answer is to refuse.
- **Expired consent:** the right person, but his permission to share has ended. Refuse.
- **Consent the plan can't honour:** the permission excludes sensitive data, which this plan can't separate out. Refuse.
- **John's details, Jon's card:** the card belongs to a near-twin name. Refuse.

## Run it

```sh
npm ci
npm run score                    # the short result (free, offline)
npm run score -- --full          # every answer, explained
npm run report                   # rebuild report/scoreboard.html
npm run score -- --ai            # add the AI adjudicator (needs ANTHROPIC_API_KEY and the SMS spend alert)
npm run score -- --ai-no-rules   # add the AI adjudicator without the HRex rules
npm run score -- --ai-definitions  # add the AI adjudicator with the rules and HRex's consent-code definitions
RELAXED_CONFIDENCE=90 npm run score
```

For developers:

```sh
npm test               # all tests (node:test)
npm run decoys:lint    # every decoy has a trap, a plain sentence and a right answer
npm run convert        # decoys -> fixtures/requests/*.json ($member-match input Parameters)
npm run validator:get  # one-time: fetch the HL7 validator (Java 17+)
npm run validate:fhir  # validate the requests against HRex 1.2.0
npm run serve          # local $member-match endpoint on 127.0.0.1:8650
npm run manifest:check # the answer key is fingerprint-locked
npm run spend:check    # AI spend vs the $50/month ceiling; SMS alert configured?
npm run llm:try        # one live AI run, decision by decision
npm run leak:check     # leak guard; needs a banlist outside this repo (LEAK_GUARD_CONFIG)
```

- [src/matchers/c057/PROVENANCE.md](src/matchers/c057/PROVENANCE.md): where the identity matcher comes from and what changed
- [docs/SPEC_NOTES.md](docs/SPEC_NOTES.md): what building against HRex turned up

## Dev console (replaces the MCP Inspector for building tools)

```sh
npm run console    # prints a local link: http://127.0.0.1:4317/#token=…
```

The console, the result view format (ToolView) and the renderer come from [mcp-tool-console](https://github.com/ImOnFHIR/mcp-tool-console), pinned to a commit in `package.json`. That repo's README covers the full contract and the console's safety rules.

- **One full-width page per tool:** what it is, what it does and how to use it; example buttons ("Try: the borrowed card"); a plain form; Run. After a run, the result comes first and the settings fold into one line.
- **Technical details** (bottom right): the raw request and response, the tool definition, the server log, and the matching Inspector command.
- **Safe by default:**
  - local only, with a per-launch link
  - runs only read-only tools; asks before any tool that may cost money
  - never passes API keys to the servers it starts
- **More servers:** add them in `console.local.json` (gitignored), same shape as `console.config.json`.

## The tool package

`npm run package` makes the package other sites pin, in two halves:

- `package/decoy-lab/` is **committed**. mcp-tool-console's `package` command writes it: `package.json`, `tools/score_member_match.json` (the `tools/list` entry, `_meta` included), `views/score_member_match/<preset>.json` (each free preset, run for real), `runs/score_member_match/ai-2026-11-04.json` (the recorded AI run) and `PROVENANCE.json` (the sha256 of every file, plus `packageDigest`). A consumer pins `packageDigest`. `test/package.test.ts` rebuilds the folder and fails on any difference.
- `dist/package/decoy-lab/browser/` is **built**, never committed: `core.js` (the scorer, browser-safe), `data.json` (the decoys, the locked answer key and the six requests), `LICENSE`, `NOTICE`, and a `PROVENANCE.json` that records each file's sha256 and the committed package's `packageDigest`.

The command refuses an uncommitted change to a tracked file and writes nothing. So: commit your change, run `npm run package`, then commit `package/decoy-lab/`.

Recorded AI runs stay in `fixtures/runs/` as `scripts/record-ai-run.mjs` writes them, with each matcher's rationale and cost. The package needs one fixed shape (`v, recorded, tool, args, structuredContent, view, model, costUsd, lockDigest`), so `src/package-build.ts` converts each run on the way in:

- `structuredContent` is the scoreboard.
- `args` names the AI matchers that ran.
- `costUsd` is their costs added up.

A run scored against a different answer-key lock is refused.

## Use it from an MCP client

`node dist/mcp.js` (after `npm run build`) is an MCP server with one read-only tool, **`score_member_match`** ("Test member-match matchers against look-alike decoys"). It takes three optional settings:

- `matchers`: which matchers to test. Default: all four rule-based ones.
- `cases`: which decoys to run. Default: all six.
- `relaxed_confidence`: 75–100, how sure the relaxed identity matcher must be.
- `detail`: `summary` (the default: the result, scores and problems) or `full` (every answer, explained).

It returns the report, plus the same results as structured data. It never runs the AI matchers, so a call is free, and nothing leaves the machine.

```sh
npx @modelcontextprotocol/inspector node dist/mcp.js
```

Claude Code config example:

```json
{ "mcpServers": { "member-match-decoy-lab": { "command": "node", "args": ["/path/to/member-match-decoy-lab/dist/mcp.js"] } } }
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).
