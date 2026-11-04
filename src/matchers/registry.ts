/**
 * The matchers on the scoreboard, with the plain names people see. User-settable:
 *   RELAXED_CONFIDENCE  how sure (75–100, a percentage) the relaxed identity matcher must be
 *                       before it accepts a single look-alike candidate. Default 85.
 *   LLM_MODEL           the Claude model for the AI matchers (default claude-sonnet-5-5)
 * The AI matchers are included only when asked for: they cost money and need an API key.
 */
import type { Matcher } from "./types.js";
import { llmMatcher, type LlmClient } from "./llm/index.js";
import { SpendGuard } from "../spend.js";
import { twilioSender } from "../alert.js";

export * from "./info.js";
import { relaxedConfidence } from "./info.js";
import { buildFreeMatchers } from "./free.js";

export interface BuildOptions { ai?: boolean; aiNoRules?: boolean; aiDefinitions?: boolean; llmClient?: LlmClient; spend?: SpendGuard }

export function buildMatchers(env: Record<string, string | undefined> = process.env, o: BuildOptions = {}): Matcher[] {
  const ms: Matcher[] = buildFreeMatchers(relaxedConfidence(env));
  const spend = o.ai || o.aiNoRules || o.aiDefinitions ? o.spend ?? new SpendGuard({ alert: twilioSender(env) }) : undefined;
  if (o.ai) ms.push(llmMatcher({ model: env.LLM_MODEL, client: o.llmClient, spend: spend! }));
  if (o.aiDefinitions) ms.push(llmMatcher({ model: env.LLM_MODEL, client: o.llmClient, spend: spend!, prompt: "rules-and-definitions" }));
  if (o.aiNoRules) ms.push(llmMatcher({ model: env.LLM_MODEL, client: o.llmClient, spend: spend!, prompt: "no-rules" }));
  return ms;
}
