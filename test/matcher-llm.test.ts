import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDecoys } from "../src/decoys.js";
import { roster } from "../src/population.js";
import { handle } from "../src/server.js";
import { llmMatcher, userPrompt, SYSTEM_PROMPT, type LlmClient, type LlmDecision } from "../src/matchers/llm/index.js";
import { parseRequest } from "../src/request.js";
import { SpendGuard, SpendCeilingError, costUsd, worstCaseUsd } from "../src/spend.js";
import { twilioSender } from "../src/alert.js";

const set = loadDecoys();
const payer = { asOf: set.asOf, canSegmentSensitive: set.targetPayer.canSegmentSensitive };
const fixture = (id: string) => JSON.parse(readFileSync(`fixtures/requests/${id}.json`, "utf8"));
const tmp = () => mkdtempSync(join(tmpdir(), "llm-"));

/** Fake model: returns a canned decision and a fixed usage; counts calls. */
function fake(decision: LlmDecision | null, opts: { usage?: any; model?: string; stop?: string } = {}) {
  const calls: { model: string; user: string }[] = [];
  const client: LlmClient = {
    async call(model, _system, user) {
      calls.push({ model, user });
      return { parsed: decision, usage: opts.usage ?? { input_tokens: 3000, output_tokens: 500 }, model: opts.model ?? model, stopReason: opts.stop ?? "end_turn" };
    },
  };
  return { client, calls };
}
const alerts = () => { const sent: string[] = []; return { sent, sender: { async send(t: string) { sent.push(t); } } }; };
const guard = (dir: string, sender = alerts().sender, ceilingUsd = 50) => new SpendGuard({ ledgerPath: join(dir, "ledger.jsonl"), ceilingUsd, alert: sender });

function setup(decision: LlmDecision | null, o: { ceiling?: number; usage?: any; model?: string; stop?: string; sender?: any } = {}) {
  const dir = tmp();
  const f = fake(decision, o);
  const a = alerts();
  const spend = guard(dir, o.sender ?? a.sender, o.ceiling);
  const m = llmMatcher({ client: f.client, spend, decisionLogPath: join(dir, "decisions.jsonl") });
  return { dir, f, a, spend, m, opts: { matchers: [m], roster: roster(set), consent: payer } };
}

test("matcher-llm: a match decision becomes a 200 with the member's UMB", async () => {
  const s = setup({ decision: "match", memberId: "SYN-MEM-1001-01", rationale: "member ID, name, DOB agree" });
  const r: any = await handle(s.opts, "ai-with-rules", fixture("D0-control"));
  assert.equal(r.status, 200);
  assert.equal(r.body.parameter[0].valueIdentifier.value, "SYN-MEM-1001-01");
  assert.match(r.log.rationale, /claude-sonnet-5-5: member ID/);
});

test("matcher-llm: each refusal kind becomes a 422 with that reason", async () => {
  for (const d of ["no-match", "multiple-matches", "consent", "review-required"] as const) {
    const s = setup({ decision: d, memberId: null, rationale: "x" });
    const r: any = await handle(s.opts, "ai-with-rules", fixture("D2-twins"));
    assert.equal(r.status, 422);
    assert.equal(r.body.issue[0].details.coding[0].code, d);
  }
});

test("matcher-llm: no consent helper — a model that ignores an expired consent is not rescued", async () => {
  const s = setup({ decision: "match", memberId: "SYN-MEM-1001-01", rationale: "looks fine" });
  const r: any = await handle(s.opts, "ai-with-rules", fixture("D3-consent-expired"));
  assert.equal(r.status, 200);
});

test("matcher-llm: every decision is logged with its rationale, model and cost", async () => {
  const s = setup({ decision: "no-match", memberId: null, rationale: "demographics disagree with the card" });
  await handle(s.opts, "ai-with-rules", fixture("D4-card-mixup"));
  const [line] = readFileSync(join(s.dir, "decisions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(line.decision.rationale, "demographics disagree with the card");
  assert.equal(line.model, "claude-sonnet-5-5");
  assert.ok(line.usd > 0);
});

test("matcher-llm: a memberId not on the roster is an error, never a match", async () => {
  const s = setup({ decision: "match", memberId: "SYN-MEM-9999-99", rationale: "x" });
  await assert.rejects(handle(s.opts, "ai-with-rules", fixture("D0-control")), /not on the roster/);
});

test("matcher-llm: a refusal stop reason or unparseable output is an error", async () => {
  await assert.rejects(handle(setup({ decision: "no-match", memberId: null, rationale: "x" }, { stop: "refusal" }).opts, "ai-with-rules", fixture("D0-control")), /refused/);
  await assert.rejects(handle(setup(null).opts, "ai-with-rules", fixture("D0-control")), /no parseable decision/);
});

test("matcher-llm: a fallback model is recorded in the rationale", async () => {
  const s = setup({ decision: "no-match", memberId: null, rationale: "x" }, { model: "claude-opus-5-5" });
  const r: any = await handle(s.opts, "ai-with-rules", fixture("D4-card-mixup"));
  assert.match(r.log.rationale, /served by claude-opus-5-5/);
});

test("matcher-llm: the prompt carries the request, roster and payer facts but no answers", () => {
  for (const c of set.cases) {
    const p = (SYSTEM_PROMPT + userPrompt(parseRequest(fixture(c.id)), roster(set), payer)).toLowerCase();
    for (const leak of [c.id.toLowerCase(), "decoy", "expected", "survivesidmatch", "trap"]) assert.ok(!p.includes(leak), `${c.id}: prompt contains "${leak}"`);
    assert.ok(p.includes(set.asOf));
  }
});

test("matcher-llm: LLM_MODEL can be raised; unpriced models are refused", () => {
  const spend = guard(tmp());
  assert.doesNotThrow(() => llmMatcher({ model: "claude-opus-5-5", spend, client: fake(null).client }));
  assert.throws(() => llmMatcher({ model: "claude-unknown-9", spend }), /no price/);
});

// ── spend guard ────────────────────────────────────────────────────────────
test("spend: cost uses list prices", () => {
  assert.equal(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 12);
  assert.equal(costUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 4);
});

test("spend: a call whose worst case would cross the ceiling is never sent", async () => {
  const s = setup({ decision: "no-match", memberId: null, rationale: "x" }, { ceiling: 0.01 });
  await assert.rejects(handle(s.opts, "ai-with-rules", fixture("D0-control")), SpendCeilingError);
  assert.equal(s.f.calls.length, 0, "the model must not be called");
});

test("spend: the 80% alert is sent once when the line is crossed", async () => {
  // ceiling $0.2 → alert at $0.16. One real (fake-model) call, then recorded spend past the line.
  const s = setup({ decision: "no-match", memberId: null, rationale: "x" }, { ceiling: 0.2 });
  await handle(s.opts, "ai-with-rules", fixture("D0-control"));
  assert.equal(s.a.sent.length, 0);
  await s.spend.afterCall("claude-sonnet-5-5", { input_tokens: 80_000, output_tokens: 0 }, "pad"); // +$0.16
  await s.spend.afterCall("claude-sonnet-5-5", { input_tokens: 1, output_tokens: 0 }, "pad");      // still over: no second alert
  assert.equal(s.a.sent.length, 1);
  assert.match(s.a.sent[0], /of \$0.2 this month/);
  assert.equal(s.spend.status().alerted, true);
});

test("spend: fail closed — an undeliverable alert blocks further calls", async () => {
  const dir = tmp();
  const broken = { async send() { throw new Error("SMS down"); } };
  const spend = guard(dir, broken, 1);
  await assert.rejects(spend.afterCall("claude-sonnet-5-5", { input_tokens: 400_000, output_tokens: 0 }, "pad"), /SMS down/);
  const f = fake({ decision: "no-match", memberId: null, rationale: "x" });
  const m = llmMatcher({ client: f.client, spend, decisionLogPath: join(dir, "d.jsonl") });
  await assert.rejects(handle({ matchers: [m], roster: roster(set), consent: payer }, "ai-with-rules", fixture("D0-control")), /SMS down/);
  assert.equal(f.calls.length, 0);
});

test("spend: worst case covers max output", () => {
  assert.ok(worstCaseUsd("claude-sonnet-5-5", 30_000, 8000) >= 8000 * 10 / 1e6);
});

test("alert: Twilio request shape, and missing config is refused", async () => {
  const seen: any[] = [];
  const ok = (async (url: any, init: any) => { seen.push({ url: String(url), init }); return new Response("{}", { status: 201 }); }) as typeof fetch;
  const env = { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+15550000000", SPEND_ALERT_SMS_TO: "+15551111111" };
  await twilioSender(env, ok).send("hi");
  assert.match(seen[0].url, /Accounts\/ACtest\/Messages\.json$/);
  assert.equal(new URLSearchParams(seen[0].init.body).get("Body"), "hi");
  await assert.rejects(twilioSender({}, ok).send("hi"), /not configured/);
  const fail = (async () => new Response(JSON.stringify({ code: 21211, message: "bad To" }), { status: 400 })) as typeof fetch;
  await assert.rejects(twilioSender(env, fail).send("hi"), /HTTP 400 21211 bad To/);
});

test("matcher-llm: the no-rules variant drops only the HRex rule text", async () => {
  const { SYSTEM_PROMPT_NO_RULES } = await import("../src/matchers/llm/index.js");
  assert.doesNotMatch(SYSTEM_PROMPT_NO_RULES, /SHALL|HRex 1\.2\.0|422/);
  assert.match(SYSTEM_PROMPT_NO_RULES, /\$member-match/);
  assert.match(SYSTEM_PROMPT_NO_RULES, /"consent" if a Consent is provided/);
  const dir = tmp();
  const f = fake({ decision: "no-match", memberId: null, rationale: "x" });
  const seen: string[] = [];
  const client: LlmClient = { call: async (m, sys, u, mt) => { seen.push(sys); return f.client.call(m, sys, u, mt); } };
  const m = llmMatcher({ client, spend: guard(dir), prompt: "no-rules", decisionLogPath: join(dir, "d.jsonl") });
  assert.equal(m.name, "ai-no-rules");
  await handle({ matchers: [m], roster: roster(set), consent: payer }, "ai-no-rules", fixture("D0-control"));
  assert.equal(seen[0], SYSTEM_PROMPT_NO_RULES);
});

test("matcher-llm: the definitions variant adds HRex's consent-code definitions to the rules prompt", async () => {
  const { SYSTEM_PROMPT, SYSTEM_PROMPT_WITH_DEFINITIONS, CONSENT_DEFINITIONS } = await import("../src/matchers/llm/index.js");
  assert.ok(SYSTEM_PROMPT_WITH_DEFINITIONS.includes(CONSENT_DEFINITIONS));
  assert.ok(SYSTEM_PROMPT_WITH_DEFINITIONS.includes("SHALL"));
  assert.match(CONSENT_DEFINITIONS, /#regular" - "Access is granted to all patient information that is not considered to be 'sensitive'/);
  assert.equal(SYSTEM_PROMPT_WITH_DEFINITIONS.replace(CONSENT_DEFINITIONS + "\n\n", ""), SYSTEM_PROMPT);
  const m = llmMatcher({ client: fake(null).client, spend: guard(tmp()), prompt: "rules-and-definitions" });
  assert.equal(m.name, "ai-with-definitions");
});
