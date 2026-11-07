/**
 * Matcher C: an LLM adjudicator. Synthetic data only.
 *
 * It sees the raw $member-match Parameters, the payer's roster and the payer's own facts
 * (today's date, whether it can segment sensitive data), plus the HRex matching rules as
 * written in the spec. It gets NO consent helper and no matching code: noticing an expired or
 * unhonourable consent is part of what is being tested (Nick, 2026-11-03).
 *
 * Model: LLM_MODEL (default claude-sonnet-5-5; rerun with e.g. claude-opus-5-5). Every call is
 * checked against the spend ceiling first and recorded after; every decision is logged.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Matcher, Decision } from "../types.js";
import type { Member } from "../../population.js";
import type { MatchRequest } from "../../request.js";
import { PRICES, SpendGuard, worstCaseUsd, type Usage } from "../../spend.js";

export const DEFAULT_LLM_MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 8000;
/** Models with a server-side refusal fallback ("default" form). Haiku has none. */
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"]);

export const LlmDecision = z.object({
  decision: z.enum(["match", "no-match", "multiple-matches", "consent", "review-required"]),
  memberId: z
    .string()
    .nullable()
    .describe("The roster memberId when decision is match; otherwise null."),
  rationale: z
    .string()
    .describe("Two to five sentences: which fields agreed or conflicted, and why this decision."),
});
export type LlmDecision = z.infer<typeof LlmDecision>;

const RULES_START = "The HRex rules you must apply";
export const SYSTEM_PROMPT = `You adjudicate Da Vinci HRex $member-match requests for a health plan (the "target payer"). All data is synthetic.

You receive the request (a FHIR Parameters resource), the target payer's member roster, and facts about the target payer. Decide what the payer should answer.

The HRex rules you must apply (HRex 1.2.0, $member-match):
- "A maximum of a SINGLE unique match SHALL be returned."
- "No match SHALL return a 422 status code."
- "Multiple matches SHALL return a 422 status code."
- "If consent is provided, inability to comply with consent requirements SHALL return a 422 status code."
- "Members implementing a deterministic match will require a match on member id or subscriber id at a minimum."

Returning the wrong member sends one person's records to another person. A refusal is the safe failure.

Answer with:
- decision "match" and the roster memberId, only if exactly one member is the person in the request;
- "no-match" if nobody on the roster is that person;
- "multiple-matches" if more than one member fits and you cannot tell them apart;
- "consent" if a Consent is provided and the payer cannot comply with it;
- "review-required" if the data conflicts in a way a human must resolve.`;

/**
 * The same prompt with the HRex rule text removed (Nick, 2026-11-03: "run once to see"). The
 * job description and the answer options stay, so only the spec knowledge is taken away.
 */
export const SYSTEM_PROMPT_NO_RULES = (() => {
  const start = SYSTEM_PROMPT.indexOf(RULES_START);
  const end = SYSTEM_PROMPT.indexOf("Returning the wrong member");
  if (start < 0 || end < 0) throw new Error("prompt markers moved");
  return SYSTEM_PROMPT.slice(0, start) + SYSTEM_PROMPT.slice(end);
})();

/**
 * HRex's own definitions of its two consent policy codes, quoted from the HRex Consent profile
 * notes (HL7/davinci-ehrx, StructureDefinition-hrex-consent-notes.md). Added after the first live
 * run showed the model reading both codes backwards (Nick, 2026-11-04: test whether this fixes it).
 */
export const CONSENT_DEFINITIONS = `HRex consent policy codes (from the HRex Consent profile):
- "http://hl7.org/fhir/us/davinci-hrex/StructureDefinition-hrex-consent.html#regular" - "Access is granted to all patient information that is not considered to be 'sensitive' according to U.S. state or federal regulation."
- "http://hl7.org/fhir/us/davinci-hrex/StructureDefinition-hrex-consent.html#sensitive" - "Access is granted to all patient information, including that considered to be 'sensitive' according to U.S. state or federal regulation."`;

export const SYSTEM_PROMPT_WITH_DEFINITIONS = SYSTEM_PROMPT.replace(
  "Returning the wrong member",
  `${CONSENT_DEFINITIONS}\n\nReturning the wrong member`,
);

/** Which prompt an AI matcher gets. */
export type PromptMode = "rules" | "no-rules" | "rules-and-definitions";
const PROMPTS: Record<PromptMode, { system: string; name: string }> = {
  rules: { system: SYSTEM_PROMPT, name: "ai-with-rules" },
  "no-rules": { system: SYSTEM_PROMPT_NO_RULES, name: "ai-no-rules" },
  "rules-and-definitions": { system: SYSTEM_PROMPT_WITH_DEFINITIONS, name: "ai-with-definitions" },
};

export interface LlmCallResult {
  parsed: LlmDecision | null;
  usage: Usage;
  model: string;
  stopReason: string | null;
}
export interface LlmClient {
  call(model: string, system: string, user: string, maxTokens: number): Promise<LlmCallResult>;
}

export function anthropicClient(client = new Anthropic()): LlmClient {
  return {
    async call(model, system, user, maxTokens) {
      const fallback = FALLBACK_MODELS.has(model);
      const res = await client.beta.messages.parse({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: {
          format: betaZodOutputFormat(LlmDecision),
          ...(process.env.LLM_EFFORT ? { effort: process.env.LLM_EFFORT as any } : {}),
        },
        ...(fallback
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });
      return {
        parsed: res.parsed_output ?? null,
        usage: res.usage,
        model: res.model,
        stopReason: res.stop_reason,
      };
    },
  };
}

export function userPrompt(
  req: MatchRequest,
  roster: Member[],
  payer: { asOf: string; canSegmentSensitive: boolean },
): string {
  return [
    `Target payer facts:\n${JSON.stringify({ today: payer.asOf, canSegmentSensitiveData: payer.canSegmentSensitive }, null, 2)}`,
    `Target payer roster (${roster.length} members):\n${JSON.stringify(roster, null, 2)}`,
    `$member-match request (FHIR Parameters):\n${JSON.stringify(req.raw, null, 2)}`,
  ].join("\n\n");
}

export interface LlmMatcherOptions {
  model?: string;
  client?: LlmClient;
  spend: SpendGuard;
  decisionLogPath?: string;
  name?: string;
  /** Which prompt: "rules" (default), "no-rules", or "rules-and-definitions". */
  prompt?: PromptMode;
}

export class LlmError extends Error {}

export function llmMatcher(o: LlmMatcherOptions): Matcher {
  const model = o.model ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  if (!PRICES[model])
    throw new Error(
      `LLM_MODEL ${model} has no price in src/spend.ts; refusing to run an unpriced model`,
    );
  let client = o.client;
  const logPath = o.decisionLogPath ?? ".runs/llm-decisions.jsonl";
  const { system, name: defaultName } = PROMPTS[o.prompt ?? "rules"];
  const name = o.name ?? defaultName;
  return {
    name,
    async decide(req, roster, payer): Promise<Decision> {
      if (!req.raw) throw new LlmError("request has no raw Parameters");
      const user = userPrompt(req, roster, payer);
      await o.spend.beforeCall(worstCaseUsd(model, system.length + user.length, MAX_TOKENS));
      client ??= anthropicClient();
      const r = await client.call(model, system, user, MAX_TOKENS);
      const usd = await o.spend.afterCall(
        model,
        r.usage,
        `${name}:${(req.raw as any)?.id ?? "request"}`,
        r.model,
      );
      const record = {
        at: new Date().toISOString(),
        matcher: name,
        request: (req.raw as any)?.id,
        model,
        servedBy: r.model,
        stopReason: r.stopReason,
        usd,
        decision: r.parsed,
      };
      mkdirSync(logPath.replace(/\/[^/]+$/, ""), { recursive: true });
      appendFileSync(logPath, JSON.stringify(record) + "\n");

      if (r.stopReason === "refusal") throw new LlmError(`model refused (served by ${r.model})`);
      if (!r.parsed) throw new LlmError(`no parseable decision (stop_reason ${r.stopReason})`);
      const served = r.model !== model ? ` [served by ${r.model}]` : "";
      const why = `${model}${served}: ${r.parsed.rationale}`;
      if (r.parsed.decision === "match") {
        if (!r.parsed.memberId || !roster.some((m) => m.memberId === r.parsed!.memberId))
          throw new LlmError(
            `model returned match with a memberId not on the roster: ${r.parsed.memberId}`,
          );
        return { kind: "match", memberId: r.parsed.memberId, rationale: why, evidence: { usd } };
      }
      return { kind: "refuse", reason: r.parsed.decision, rationale: why, evidence: { usd } };
    },
  };
}
