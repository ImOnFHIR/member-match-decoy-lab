# member-match-decoy-lab

> **Synthetic data only; not a production matching recommendation.**

When one health plan asks another "who is this member?" (Da Vinci HRex `$member-match`), a wrong answer sends one person's records to someone else. This lab plants look-alike members and consent problems in synthetic requests, runs several ways of matching against them, and reports in plain English who found the right person, who rightly refused, and who sent records to the wrong person.

Status: v0 under construction (target 2026-12-02). Progress is in [REMAINING_WORK.md](REMAINING_WORK.md).

## What happened

**1 of 4 matchers sent someone's records to the wrong person: ID-first rules.** Given John Roe's details on Jon Roe's card, it trusted the card and sent Jon Roe's records.

| Matcher | Right | What it got wrong |
|---|---|---|
| Scored identity matcher, strict | 5 of 6 | Refused Rowan Quill Jr, who was the right answer (safe, but a miss) |
| Scored identity matcher, relaxed | 6 of 6 | |
| ID-first rules | 5 of 6 | **Sent Jon Roe's records in answer to a request for John Roe** |
| Check-every-field rules | 6 of 6 | |

See every answer on the [scoreboard page](report/scoreboard.html) (open it in a browser), or run `npm run score` for the same report in the terminal.

## The matchers

| Name | Id | What it does |
|---|---|---|
| Scored identity matcher, strict | `identity-strict` | Checks the member ID first, then scores how alike the name and birth date are. Accepts a look-alike only when at least 90% sure; otherwise sends it to human review. Ported from an identity service ([provenance](src/matchers/c057/PROVENANCE.md)). |
| Scored identity matcher, relaxed | `identity-relaxed` | The same matcher, accepting a look-alike at a confidence you set: `RELAXED_CONFIDENCE=85` (75–100, default 85). |
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
- `manifest/browser.sha256.json` is **committed**: the sha256 of `core.js` and `data.json`. The server advertises it in the tool's `_meta["com.imonfhir/browser"]`, so it lands in `tools/score_member_match.json` and the pinned `packageDigest` covers the browser code. A consumer checks `core.js` and `data.json` against those hashes. The browser `PROVENANCE.json` is a convenience and is not what it trusts.

The command refuses an uncommitted change to a tracked file and writes nothing. So: commit your change, run `npm run package`, then commit `package/decoy-lab/`. If the browser code changed, the first run updates `manifest/browser.sha256.json` and stops. Commit that, then package again.

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

## Run over HTTP

The same server and the same tool, over MCP Streamable HTTP: stateless, `POST /mcp`, plus `GET /healthz`. It listens on `PORT` (default 8080). It reads no API key and no spend settings, and it never runs the AI matchers, so a call is free and every call returns what the stdio server returns.

```sh
npm run start:http                       # builds, then serves http://127.0.0.1:8080/mcp

docker build -t member-match-decoy-lab .
docker run --rm -p 8080:8080 member-match-decoy-lab
curl http://127.0.0.1:8080/healthz       # ok
```

There is no sign-in in the server. Put it behind something that has one before it leaves your machine.

## Run inside your network

The MCP server runs on your own hardware with nothing from ImOnFHIR, Cloudflare or any shared service in the path. It scores the lab's own synthetic requests, takes no data from you, stores nothing, and makes no off-machine network request. Synthetic data only.

**Container.** Build it once with network access (`npm ci` fetches from the npm registry and from GitHub, because `mcp-tool-console` is a git dependency), then run it on a Docker network with `internal: true`:

```sh
docker build -t member-match-decoy-lab .
docker network create --internal mm-internal
docker run --rm --network mm-internal --read-only member-match-decoy-lab
```

The image runs as the non-root `node` user, listens on `PORT` (default 8080) and answers `GET /healthz`. Reach it from another container on that network at `http://<container>:8080/mcp`. The server has no sign-in; put your own proxy in front of it.

**Stdio.** `npm ci && npm run build`, then `node dist/mcp.js`. Needs Node 22+.

**Environment variables the MCP server reads.** One. It needs no other setting, no key and no config file.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP listen port (`node dist/mcp-http.js`). The stdio server reads nothing. |

**Read only by the command-line tools.** The code under `src/` also reads the variables below. The MCP server never uses them: it builds the four rule-based matchers from the tool's own arguments, never from the environment. They are for `npm run score`, `npm run serve` and the spend and AI tools, which are not part of the image's entry point.

| Variable | Default | Meaning |
|---|---|---|
| `RELAXED_CONFIDENCE` | `85` | Relaxed matcher's confidence line, 75 to 100. |
| `LLM_MODEL` | the code's default model | Model for the AI matchers (`--ai` flags only). |
| `LLM_EFFORT` | unset | Effort setting for the AI matchers (`--ai` flags only). |
| `TWILIO_ACCOUNT_SID` | unset | SMS spend alert, AI runs only. |
| `TWILIO_AUTH_TOKEN` | unset | SMS spend alert, AI runs only. |
| `TWILIO_FROM_NUMBER` | unset | SMS spend alert, AI runs only. |
| `SPEND_ALERT_SMS_TO` | unset | SMS spend alert, AI runs only. |

`npm run serve` also reads `PORT` (default 8650, loopback only). The AI matchers use the Anthropic SDK, which reads its own API key from the environment; no key belongs in the image and the image never uses one.

**Offline mode and how it is proven.** There is no offline switch because there is nothing to switch off: the MCP server's code path makes no off-machine request. This repo has no container egress probe (it is not built here). What exists is `test/self-hosting.test.ts`, which starts the real stdio server with `fetch` and TCP connects instrumented to record and refuse anything that is not loopback, runs the tool, and asserts none was attempted; a control in the same file proves the instrumentation catches a call. Running the container on an `internal: true` network is the operator's own backstop.

**What it never sends.** The MCP server sends nothing to anyone: no telemetry, no model call, no alert. Logs go to standard error. Its one network use is the scorer's calls to its own in-process `$member-match` endpoint on `127.0.0.1`, a random free port that never leaves the machine (`src/run.ts`). The only network use in the repo outside it is deliberate and opt-in from the command line: `npm run score -- --ai` (and the two other `--ai-` flags) sends decision prompts of synthetic requests to the Anthropic API, and the spend guard can send an SMS through Twilio. Neither runs unless you pass the flag, and neither is reachable from the MCP server or the image's entry point.

**Model endpoint.** None is needed. The MCP server never calls a model. The AI matchers are optional, command-line only, and wired to the Anthropic SDK; there is no setting in this repo for your own model endpoint.

**No hosted dependency.** The code and the running image use no ImOnFHIR hosting, Cloudflare, imonfhir.com or shared console. The dev console (`npm run console`) is a local tool and is not in the image's entry point.

**Honest limits.** Building the image needs the internet (npm and GitHub). The image also contains the Anthropic SDK and the AI-matcher and SMS-alert code; the MCP entry never calls them, and `test/self-hosting.test.ts` is what keeps that true.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
