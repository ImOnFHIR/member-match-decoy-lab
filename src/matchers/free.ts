/** The four free, rule-based matchers. Node-free: safe for the browser core. */
import type { Matcher } from "./types.js";
import { c057Matcher } from "./c057/index.js";
import { baselineMatcher } from "./baseline/index.js";

/** relaxedConfidence is 0–1 (from relaxedConfidence() in info.ts). */
export function buildFreeMatchers(relaxedConfidence: number): Matcher[] {
  return [
    c057Matcher(),
    c057Matcher({ name: "identity-relaxed", autoConfirm: relaxedConfidence }),
    baselineMatcher("tiered"),
    baselineMatcher("strict"),
  ];
}
