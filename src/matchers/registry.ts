/**
 * The matchers on the scoreboard. User-settable:
 *   C057_AUTO_CONFIRM  auto-confirm line for the "c057-tuned" variant (default 0.85; C-057's own is 0.90)
 */
import type { Matcher } from "./types.js";
import { c057Matcher } from "./c057/index.js";
import { baselineMatcher } from "./baseline/index.js";

export const DEFAULT_TUNED_AUTO_CONFIRM = 0.85;

export function buildMatchers(env: Record<string, string | undefined> = process.env): Matcher[] {
  const raw = env.C057_AUTO_CONFIRM;
  const tuned = raw === undefined || raw === "" ? DEFAULT_TUNED_AUTO_CONFIRM : Number(raw);
  if (!Number.isFinite(tuned)) throw new Error(`C057_AUTO_CONFIRM must be a number; got "${raw}"`);
  return [
    c057Matcher(),
    c057Matcher({ name: "c057-tuned", autoConfirm: tuned }),
    baselineMatcher("tiered"),
    baselineMatcher("strict"),
  ];
}
