# Remaining work

Newest session first.

## 2026-11-10 session (re-land of the shared-console move)
Completed:
- The 2026-11-08 move (PR #3) never reached `main`. PR #3 was opened against `docs/remaining-work-2026-11-07`. That branch had merged to `main` as PR #2 ninety-one seconds earlier, so PR #3's merge commit `d08b6a7` landed on an orphaned branch, and it is still not an ancestor of `main`. This branch takes the same two commits (`db10d68`, `bace5c9`), merges `main` in, and targets `main`.
- mcp-tool-console is public, so anyone can install this repo again.
- `package.json` pins the console as `git+https://github.com/ImOnFHIR/mcp-tool-console.git#9abccf7…` (full SHA). npm still writes the lockfile's `resolved` as `git+ssh://` for any GitHub dependency. That is harmless: with no SSH key, npm falls back to https, and a clean `npm ci` with no credentials succeeds.
- Same pin as PR #3 (`9abccf7`). Moving to the console's newer `main` is its own reviewed change.

Remaining:
- After this merges: delete the branches `docs/remaining-work-2026-11-07` and `feat/use-mcp-tool-console` (maintainer).
- The console pin bump, the `package` command and the committed package parts (separate PRs).

Tests: see the PR body (counts are derived from the run, not typed here).

## 2026-11-08 session (shared console moved out)
Completed:
- The tool contract, ToolView v1, renderer, form and dev console moved to their own repo, ImOnFHIR/mcp-tool-console (Nick, 2026-11-07: "move to its own repo"). This repo installs it pinned to 9abccf7.
- Deleted here: `src/tool-meta.ts`, `src/ui/{view,render,form,styles}.ts`, `src/ui/browser/console-main.ts`, `src/console/*`, `docs/tool-view.schema.json`, `test/helpers/fake-mcp.ts`. Imports now point at the package.
- Stays here: the in-Claude view (`src/ui/browser/view-main.ts`, built by `scripts/ui-build.mjs`), `test/views/` (conformance views), `test/ui-render.test.ts` (this repo's views and live schema through the pinned renderer).
- `test/console.test.ts` is now two tests: this repo's server in the package's console. The console's own rules are tested in mcp-tool-console.
- That move fixed four safety gaps codex review found in the moved code (also present here before): schema bounds and table-cell statuses could inject HTML, a committed config could pass environment variables, and the cost tick carried over between runs.
- Claude Desktop: this server is added to its config (backup kept beside it). The Desktop test itself waits on Nick.
- Nick, 2026-11-07: the imonfhir page is Nick's to plan with the imonfhir UX agent. No imonfhir work from this repo, and no handoff brief.

Remaining:
- ~~**Don't merge until mcp-tool-console is public.**~~ Done 2026-11-10: the repo is public (see the 2026-11-10 re-land section above).
- Claude Desktop test: say "run the decoy test" and record card or plain text.
- Phone-width check of the console: still CSS-only.
- Tasks 10–11.

Deviations:
- `npm test` count drops from 190 to 176: 14 console tests moved with the console.

Tests: `npm test` 176/176; decoys:lint ✓; leak:check 0 violations (105 files); manifest:check ✓ (afd4a0787ca3, unchanged); validate:fhir 6/6, 0 errors. `dist/ui/view.html` 539 KB (+189 bytes from the escaping fix). Smoke test from another folder: one tool, view resource listed, result view present. `mcp-tool-console` command starts this server and serves its page. No AI calls; spend unchanged.

## 2026-11-07 session
Completed:
- This file brought up to date and reordered newest first, as AGENTS.md asks. Older sections are unchanged apart from order.
- Phase 3 (in-Claude view, MCP App) was finished 2026-11-04 in be20f8f; the phase 1 entry below still listed it as remaining. It was built before the phase 0 Claude Desktop test, which the UI plan made its gate. Risk is low: a host that can't show the view still gets the unchanged text answer.
- PR #1 merged 2026-11-07 (f851f0e): AGENTS.md, VS Code tasks, Prettier and Oxlint config, two lint fixes (same behaviour), one formatting-only commit skipped in git blame.

Remaining:
- Phase 0, Claude Desktop test: not run. Claude Desktop has no MCP servers configured yet, so this server has to be added first. Then ask Claude "run the decoy test" and record whether the card or plain text appears.
- Phase 2, imonfhir page: not started (no decoy or member-match work on any imonfhir branch, checked 2026-11-07). Still blocked on Nick's 4 answers.
- Phase 4, console contract and split for agent-vs-validator: planned, waiting on Nick's yes.
- Phone-width check of the console: still CSS-only.
- Tasks 10–11.

Deviations:
- The view size ceiling in `test/mcp-app.test.ts` is 600 KB, not the UI plan's 400 KB. `dist/ui/view.html` is 527 KB, almost all of it zod, pulled in by `@modelcontextprotocol/ext-apps`.

Tests: `npm run ui:build` then `npm test` 190/190. No AI calls this session; spend unchanged.

## 2026-11-04 session (UI plan, phase 1)
Completed (plan: ~/.claude/plans/all-right-so-yes-delightful-reef.md):
- tool contract + ToolView v1 (87ee8d5)
- Node-free browser core, vendor bundle, recorded AI run (ff2c4d9)
- shared renderer/form + dev console with security tests (cccda93)
Checked in Chrome: home page, tool page, "Try: the borrowed card" result, technical drawer.
NOT checked: phone width. The window wouldn't resize below desktop; only the CSS is tested.
Planning-agent findings for the imonfhir page:
- MASTER_PLAN_V2 §6 bans new tools, so it needs Nick's amendment.
- imonfhir publicly doesn't ship name scorers, so the page presents matchers as test subjects.
- Use the vendored browser bundle (no API route).
- Sibling tools get no workbench pages (Validator and Compare already exist).
Remaining: phase 0 Claude Desktop spike; phase 2 imonfhir handoff (blocked on Nick's 4 answers); phase 3 MCP App; phase 4 sibling contract + split; tasks 10–11.
Tests: 186/186. Spend: $0.23 of $50.

## 2026-11-04 session (continued)
Completed: 7 live (three AI versions; README "First AI run"); readability pass 2 (Nick: "too much narrative"): MCP description in labelled bullet sections, `detail` setting (summary default / full), `npm run score` short by default (`--full`), page summary-first with collapsible sections, published privately at https://claude.ai/artifact/DRHFnABDm7uP7Mk5EQiUVF.
AI finding: Sonnet 5.5 misreads the HRex consent codes (#regular / #sensitive). With rules 3/6, with rules + definitions 5/6, no rules 5/6. No AI version sent records to the wrong person. Verified #regular/#sensitive meanings in the HRex source (StructureDefinition-hrex-consent-notes.md).
Deviation: added a third AI version (ai-with-definitions), at Nick's request.

## 2026-11-03 session
Completed: 1 (scaffold, da68a19); 2 (decoys, reviewed by Nick by voice, eef5160); 3 (converter + HRex validation, ca757e9); leak guard ported (C-059); 4 (digest-locked ground-truth manifest, bfbb149); 5 (matcher A: C-057 behind a local $member-match endpoint, 77671a9); 6 (matcher B: tiered + strict baselines; c057-tuned variant, 8526b12); 7 code-complete (LLM matcher + llm-norules variant, spend guard, SMS alert, 87407da): live run waits on Nick's keys; 8 (scorer, npm run score, golden scoreboard, 3de1815); 9 (MCP stdio server dist/mcp.js, one read-only tool score_member_match, a47963a; Nick confirmed in the Inspector 2026-11-04); readability pass (Nick, 2026-11-04: "not user friendly"): plain matcher names, plain-English report, MCP settings in plain words, report/scoreboard.html
Remaining: 10–11
Deviations: Repo is public from the first commit (Nick, 2026-11-03). `npm test -- <name>` filters test files by name through `scripts/test.mjs`. Lab adds synthetic Quill family and gender (not in C-055). C-059 leak guard ported with its banlist kept outside the repo (care-continuum-lab config plus ~/.config/member-match-decoy-lab/banlist.json); fails closed if none is found. Validator allows one known HRex false positive (docs/SPEC_NOTES.md #1). MemberPatient carries a synthetic new-plan identifier so Consent.patient meets US Core (SPEC_NOTES #2). C-057 ported (src/matchers/c057/PROVENANCE.md): address bonus removed (no address in requests), event store/merge not ported (stateless call), lab settings = standard profile, MB→memberId, subscriberId unmapped. Consent (mm-11) is each matcher's job (Nick, 2026-11-03): c057 and baselines call consentGate() explicitly; the LLM arm gets no helper; the endpoint checks nothing. Scorer rule (Nick, 2026-11-03): any 422 where a 422 is due counts as correct; reason mismatch flagged. Scorer adds three wrong categories beyond the brief: consent-ignored, missed-match, error. LLM no-rules variant (llm-norules) added for one comparison run (Nick, 2026-11-04). baseline-strict is an added variant (not in the brief) to contrast with the brief's tiered baseline. Java: Homebrew openjdk@21; validator 7.0.4 in .tools/ (gitignored).
Test results: npm test 142/142 pass (MCP: listed + called over stdio via the SDK client); score: c057 5/6 (D1 missed), c057-tuned 6/6, baseline 5/6 (D4 DECOY CONFUSION), baseline-strict 6/6; manifest re-locked afd4a0787ca3 (added subjectMemberId; earlier d2b52ce0a639 after requests were made opaque (case names leaked into request ids, now hashed; namespace moved to https://imonfhir.com/ns/synthetic)); validate:fhir 6/6 0 errors. Observed: c057 misses D1 (422 review at 0.87 < 0.90), else correct; c057-tuned (0.85) correct on all; baseline (tiered) DECOY CONFUSION on D4 (returns Jon's MEM-1002-01 for John's request) and 422 no-match on D2; baseline-strict correct on all (D2 as no-match); response Parameters + OperationOutcome validate (0 errors); manifest:check ✓ 6 entries, lock 59122badc0a3; validate:fhir 6/6 files 0 errors (6 known, 0 unknown); leak:check 0 violations; decoys:lint ✓ 6 cases, 3 survive an ID match; gitleaks clean.
Spend to date: $0.23 of $50 (18 Sonnet 5.5 calls, 2026-11-04; no fallback served). SMS alert tested end to end: Twilio accepted the message and Nick confirmed it arrived (2026-11-04). LLM: claude-sonnet-5-5 default, LLM_MODEL to rerun higher; server-side refusal fallback on ("default"), served-by model logged.
PENDING decisions: Nick to set ANTHROPIC_API_KEY + 4 Twilio env vars. LLM prompt includes the HRex rule text (mm-8..11 + deterministic minimum) by default. (DECOYS.md 1–5 decided; SPEC_NOTES stays in repo for the video, Nick 2026-11-03). D3b's 'payer cannot segment sensitive data' is a declared lab assumption.
Nick hours this week: 0.6 of 1.75

Renames (2026-11-04, Nick): c057 → identity-strict, c057-tuned → identity-relaxed, baseline → id-first, baseline-strict → check-every-field, llm → ai-with-rules, llm-norules → ai-no-rules. C057_AUTO_CONFIRM=0.85 → RELAXED_CONFIDENCE=85. score flags --llm/--llm-norules → --ai/--ai-no-rules. The golden scoreboard was regenerated; the results are identical after the rename, and the manifest digest is unchanged.
