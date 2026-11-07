/**
 * Matcher B: a simple deterministic baseline, the way a tiered member-match is commonly built.
 *
 * "tiered" (the brief's baseline): identifier first, then name, DOB, gender.
 *   1. Candidates = members whose member ID matches the card's; if the card has no member ID,
 *      members whose subscriber ID matches. No identifier on the card: 422 no-match
 *      (HRex: a deterministic match needs member id or subscriber id at a minimum).
 *   2. While more than one candidate remains, narrow by exact name (given + family; suffix
 *      only if the request has one), then exact DOB, then gender. Each filter is applied only
 *      while it is still needed: a single candidate is returned as soon as it is reached.
 *   3. 0 left: 422 no-match. 1: match. More than 1 after every tier: 422 multiple-matches.
 *
 * "strict": the same candidates, but every field must agree, even when the identifier already
 * picked one member. The contrast is the point: tiered trusts the identifier; strict verifies it.
 *
 * Both apply HRex mm-11 (consent) explicitly before matching.
 */
import type { Matcher, Decision } from "../types.js";
import type { Member } from "../../population.js";
import type { MatchRequest } from "../../request.js";
import { consentGate } from "../../consent.js";

const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Filter = { attr: string; keep: (m: Member, r: MatchRequest) => boolean };
const FILTERS: Filter[] = [
  {
    attr: "name",
    keep: (m, r) =>
      norm(m.given) === norm(r.given) &&
      norm(m.family) === norm(r.family) &&
      (!r.suffix || norm(m.suffix) === norm(r.suffix)),
  },
  { attr: "birthDate", keep: (m, r) => !!r.birthDate && m.birthDate === r.birthDate },
  { attr: "gender", keep: (m, r) => !!r.gender && m.gender === r.gender },
];

export type BaselineMode = "tiered" | "strict";

export function baselineMatcher(mode: BaselineMode = "tiered"): Matcher {
  return {
    name: mode === "tiered" ? "id-first" : "check-every-field",
    decide(req, roster, payer): Decision {
      const consent = consentGate(req, payer);
      if (!consent.ok)
        return {
          kind: "refuse",
          reason: "consent",
          rationale: `consent check (mm-11): ${consent.reason}`,
        };

      let key: string;
      let set: Member[];
      if (req.memberId) {
        key = "memberId";
        set = roster.filter((m) => m.memberId === req.memberId);
      } else if (req.subscriberId) {
        key = "subscriberId";
        set = roster.filter((m) => m.subscriberId === req.subscriberId);
      } else
        return {
          kind: "refuse",
          reason: "no-match",
          rationale:
            "card carries neither member ID nor subscriber ID; a deterministic match needs one",
        };

      const trail = [`${key}: ${set.length}`];
      for (const f of FILTERS) {
        if (set.length === 0) break;
        if (mode === "tiered" && set.length === 1) break;
        set = set.filter((m) => f.keep(m, req));
        trail.push(`${f.attr}: ${set.length}`);
      }
      const why = trail.join(" → ");
      if (set.length === 1)
        return { kind: "match", memberId: set[0].memberId, rationale: `${mode}: ${why}` };
      if (set.length === 0)
        return { kind: "refuse", reason: "no-match", rationale: `${mode}: ${why}` };
      return { kind: "refuse", reason: "multiple-matches", rationale: `${mode}: ${why}` };
    },
  };
}
