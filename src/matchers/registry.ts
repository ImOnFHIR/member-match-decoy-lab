/**
 * The matchers on the scoreboard. User-settable:
 *   C057_AUTO_CONFIRM  auto-confirm line for the "c057-tuned" variant (default 0.85; C-057's own is 0.90)
 *   LLM_MODEL          model for the "llm" matcher (default claude-sonnet-5-5)
 * The LLM matcher is included only when asked for (it costs money and needs an API key).
 */
import type { Matcher } from "./types.js";
import { c057Matcher } from "./c057/index.js";
import { baselineMatcher } from "./baseline/index.js";
import { llmMatcher, type LlmClient } from "./llm/index.js";
import { SpendGuard } from "../spend.js";
import { twilioSender } from "../alert.js";

export const DEFAULT_TUNED_AUTO_CONFIRM = 0.85;

export interface BuildOptions { llm?: boolean; llmClient?: LlmClient; spend?: SpendGuard }

export function buildMatchers(env: Record<string, string | undefined> = process.env, o: BuildOptions = {}): Matcher[] {
  const raw = env.C057_AUTO_CONFIRM;
  const tuned = raw === undefined || raw === "" ? DEFAULT_TUNED_AUTO_CONFIRM : Number(raw);
  if (!Number.isFinite(tuned)) throw new Error(`C057_AUTO_CONFIRM must be a number; got "${raw}"`);
  const ms: Matcher[] = [
    c057Matcher(),
    c057Matcher({ name: "c057-tuned", autoConfirm: tuned }),
    baselineMatcher("tiered"),
    baselineMatcher("strict"),
  ];
  if (o.llm) ms.push(llmMatcher({ model: env.LLM_MODEL, client: o.llmClient, spend: o.spend ?? new SpendGuard({ alert: twilioSender(env) }) }));
  return ms;
}
