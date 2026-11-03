/** Matcher A: C-057 behind the $member-match endpoint. */
import type { Matcher } from "../types.js";
import { fullName } from "../../population.js";
import { consentGate } from "../../consent.js";
import { decide } from "./decide.js";
import { THRESHOLDS, type ThresholdProfile } from "./config.js";

export interface C057Options {
  name?: string;
  profile?: ThresholdProfile;
  /** Auto-confirm line for a sole probabilistic candidate. C-057's own value is 0.90. */
  autoConfirm?: number;
}

export function c057Matcher(opts: C057Options = {}): Matcher {
  const profile = opts.profile ?? "standard";
  const autoConfirm = opts.autoConfirm ?? THRESHOLDS.autoConfirmStandard;
  if (!(autoConfirm >= THRESHOLDS.probable && autoConfirm <= 1))
    throw new Error(`autoConfirm must be between ${THRESHOLDS.probable} (C-057's probable line) and 1; got ${autoConfirm}`);
  return {
    name: opts.name ?? "c057",
    decide(req, roster, payer) {
      // C-057 has no consent concept of its own (its gate is purpose-of-use). The wrapper
      // applies HRex mm-11 explicitly, as any rule-based implementer would have to.
      const consent = consentGate(req, payer);
      if (!consent.ok) return { kind: "refuse", reason: "consent", rationale: `wrapper consent check (mm-11): ${consent.reason}` };
      const identities = roster.map((m) => ({ id: m.memberId, attributes: [{ name: fullName(m), birthDate: m.birthDate, memberId: m.memberId }] }));
      const record = { name: fullName(req), birthDate: req.birthDate, ...(req.memberId ? { memberId: req.memberId } : {}) };
      const out = decide(record, identities, profile, autoConfirm);
      switch (out.status) {
        case "confirmed":
          return { kind: "match", memberId: out.identity, rationale: `C-057 confirmed (${out.method}, score ${out.cmp.score}; agreed ${out.cmp.agreed.join(",") || "-"}; auto-confirm ${autoConfirm})`, evidence: out };
        case "under-review":
          return out.why === "ambiguous"
            ? { kind: "refuse", reason: "multiple-matches", rationale: `C-057 ambiguous: ${out.candidates.length} candidates ≥ probable`, evidence: out }
            : { kind: "refuse", reason: "review-required", rationale: `C-057 sent to steward review (${out.why}, score ${out.cmp.score}, auto-confirm ${autoConfirm}); not returnable as a unique match`, evidence: out };
        case "minted":
          return { kind: "refuse", reason: "no-match", rationale: "C-057 found no candidate and would mint a new identity", evidence: out };
      }
    },
  };
}
