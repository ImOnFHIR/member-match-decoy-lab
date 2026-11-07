import type { Member } from "../population.js";
import type { MatchRequest } from "../request.js";
import type { Reason } from "../fhir.js";
import type { ConsentContext } from "../consent.js";

export type Decision =
  | { kind: "match"; memberId: string; rationale: string; evidence?: unknown }
  | {
      kind: "refuse";
      reason: Exclude<Reason, "bad-request">;
      rationale: string;
      evidence?: unknown;
    };

/** What the target payer knows about itself: today's date and whether it can segment sensitive data. */
export type PayerContext = ConsentContext;

/**
 * A matcher sees the request, the payer's roster and the payer's own context. Never the
 * manifest or the decoy cases. Each matcher is responsible for HRex mm-11 (consent) itself:
 * the endpoint does not check consent, so a matcher that ignores it is scored on that.
 */
export interface Matcher {
  name: string;
  decide(req: MatchRequest, roster: Member[], payer: PayerContext): Decision | Promise<Decision>;
}
