/**
 * The matchers on the scoreboard, with the plain names people see. User-settable:
 *   RELAXED_CONFIDENCE  how sure (75–100, a percentage) the relaxed identity matcher must be
 *                       before it accepts a single look-alike candidate. Default 85.
 *   LLM_MODEL           the Claude model for the AI matchers (default claude-sonnet-5-5)
 * The AI matchers are included only when asked for: they cost money and need an API key.
 */
import type { Matcher } from "./types.js";
import { c057Matcher } from "./c057/index.js";
import { baselineMatcher } from "./baseline/index.js";
import { llmMatcher, type LlmClient } from "./llm/index.js";
import { SpendGuard } from "../spend.js";
import { twilioSender } from "../alert.js";

export const DEFAULT_RELAXED_CONFIDENCE = 85;

export interface MatcherInfo { id: string; label: string; summary: string; costsMoney: boolean }

export const MATCHER_INFO: MatcherInfo[] = [
  { id: "identity-strict", label: "Identity matcher, strict", costsMoney: false,
    summary: "Nick's event-sourced identity matcher (C-057) at its own setting: accepts a look-alike only when it is at least 90% sure; otherwise sends it to human review." },
  { id: "identity-relaxed", label: "Identity matcher, relaxed", costsMoney: false,
    summary: "The same matcher, but it accepts a look-alike at a confidence you set (default 85%)." },
  { id: "id-first", label: "ID-first rules", costsMoney: false,
    summary: "Trusts the member or subscriber ID on the card; uses name, birth date and gender only to break ties. A common way to build member match." },
  { id: "check-every-field", label: "Check-every-field rules", costsMoney: false,
    summary: "Finds the card's ID, then insists that name, birth date and gender all agree, even when the ID already picked one person." },
  { id: "ai-with-rules", label: "AI adjudicator, with rules", costsMoney: true,
    summary: "Claude reads the request and the member list, given the HRex matching rules. No helper code." },
  { id: "ai-no-rules", label: "AI adjudicator, no rules", costsMoney: true,
    summary: "The same, but told nothing about the HRex rules: what does the model know on its own?" },
];

export const infoFor = (id: string) => MATCHER_INFO.find((m) => m.id === id);
export const labelFor = (id: string) => infoFor(id)?.label ?? id;

export interface BuildOptions { ai?: boolean; aiNoRules?: boolean; llmClient?: LlmClient; spend?: SpendGuard }

/** RELAXED_CONFIDENCE as a percentage (75–100) → C-057's 0–1 auto-confirm line. */
export function relaxedConfidence(env: Record<string, string | undefined>): number {
  const raw = env.RELAXED_CONFIDENCE;
  const pct = raw === undefined || raw === "" ? DEFAULT_RELAXED_CONFIDENCE : Number(raw);
  if (!Number.isFinite(pct) || pct < 75 || pct > 100)
    throw new Error(`RELAXED_CONFIDENCE must be a percentage from 75 to 100; got "${raw}"`);
  return pct / 100;
}

export function buildMatchers(env: Record<string, string | undefined> = process.env, o: BuildOptions = {}): Matcher[] {
  const ms: Matcher[] = [
    c057Matcher(),
    c057Matcher({ name: "identity-relaxed", autoConfirm: relaxedConfidence(env) }),
    baselineMatcher("tiered"),
    baselineMatcher("strict"),
  ];
  const spend = o.ai || o.aiNoRules ? o.spend ?? new SpendGuard({ alert: twilioSender(env) }) : undefined;
  if (o.ai) ms.push(llmMatcher({ model: env.LLM_MODEL, client: o.llmClient, spend: spend! }));
  if (o.aiNoRules) ms.push(llmMatcher({ model: env.LLM_MODEL, client: o.llmClient, spend: spend!, rules: false }));
  return ms;
}
