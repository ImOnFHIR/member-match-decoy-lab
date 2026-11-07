/**
 * HRex mm-11: "If consent is provided, inability to comply with consent requirements SHALL
 * return a 422 status code." A helper the rule-based matchers call explicitly. The endpoint
 * does not apply it: each matcher handles consent itself, and the LLM arm gets no helper.
 */
import type { MatchRequest } from "./request.js";
import { POLICY } from "./synthetic-ns.js";

export interface ConsentContext {
  asOf: string;
  canSegmentSensitive: boolean;
}
export type ConsentVerdict = { ok: true } | { ok: false; reason: string };

export function consentGate(req: MatchRequest, ctx: ConsentContext): ConsentVerdict {
  const c = req.consent;
  if (!c) return { ok: true }; // no Consent supplied: mm-11 does not apply
  if (c.status && c.status !== "active")
    return { ok: false, reason: `Consent.status is ${c.status}` };
  const { start, end } = c.period ?? {};
  if (start && ctx.asOf < start)
    return { ok: false, reason: `consent period starts ${start}, after ${ctx.asOf}` };
  if (end && ctx.asOf > end)
    return { ok: false, reason: `consent period ended ${end}, before ${ctx.asOf}` };
  if (c.policy.includes(POLICY.regular) && !ctx.canSegmentSensitive)
    return {
      ok: false,
      reason:
        "consent permits non-sensitive data only (#regular) and this payer cannot segment sensitive data",
    };
  if (!c.policy.some((u) => u === POLICY.regular || u === POLICY.sensitive))
    return { ok: false, reason: "no recognised HRex consent policy" };
  return { ok: true };
}
