import type { Member } from "../population.js";
import type { MatchRequest } from "../request.js";
import type { Reason } from "../fhir.js";

export type Decision =
  | { kind: "match"; memberId: string; rationale: string; evidence?: unknown }
  | { kind: "refuse"; reason: Exclude<Reason, "consent" | "bad-request">; rationale: string; evidence?: unknown };

/** A matcher sees the request and the payer's roster. Never the manifest or the decoy cases. */
export interface Matcher {
  name: string;
  decide(req: MatchRequest, roster: Member[]): Decision | Promise<Decision>;
}
