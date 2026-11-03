/** Matcher A: C-057 behind the $member-match endpoint. */
import type { Matcher } from "../types.js";
import { fullName } from "../../population.js";
import { decide } from "./decide.js";
import type { ThresholdProfile } from "./config.js";

export function c057Matcher(profile: ThresholdProfile = "standard"): Matcher {
  return {
    name: "c057",
    decide(req, roster) {
      const identities = roster.map((m) => ({ id: m.memberId, attributes: [{ name: fullName(m), birthDate: m.birthDate, memberId: m.memberId }] }));
      const record = { name: fullName(req), birthDate: req.birthDate, ...(req.memberId ? { memberId: req.memberId } : {}) };
      const out = decide(record, identities, profile);
      switch (out.status) {
        case "confirmed":
          return { kind: "match", memberId: out.identity, rationale: `C-057 confirmed (${out.method}, score ${out.cmp.score}; agreed ${out.cmp.agreed.join(",") || "-"})`, evidence: out };
        case "under-review":
          return out.why === "ambiguous"
            ? { kind: "refuse", reason: "multiple-matches", rationale: `C-057 ambiguous: ${out.candidates.length} candidates ≥ probable`, evidence: out }
            : { kind: "refuse", reason: "review-required", rationale: `C-057 sent to steward review (${out.why}); not returnable as a unique match`, evidence: out };
        case "minted":
          return { kind: "refuse", reason: "no-match", rationale: "C-057 found no candidate and would mint a new identity", evidence: out };
      }
    },
  };
}
