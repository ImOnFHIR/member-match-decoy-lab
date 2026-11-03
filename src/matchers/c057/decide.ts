// Ported from care-continuum-lab pocs/identity-service/src/core.mjs matchPipeline() @ 7422a34.
// Same branches, same order; events replaced by a single decision (see PROVENANCE.md).
import { compare, type Comparison, type Facet, type Identity } from "./compare.js";
import { THRESHOLDS, type ThresholdProfile } from "./config.js";

export type C057Outcome =
  | { status: "confirmed"; method: "deterministic" | "probabilistic"; identity: string; cmp: Comparison }
  | { status: "under-review"; why: "det-conflict" | "ambiguous" | "probable"; candidates: string[]; cmp: Comparison }
  | { status: "minted" };

export function decide(record: Facet, identities: Identity[], profile: ThresholdProfile): C057Outcome {
  const candidates: { id: string; cmp: Comparison }[] = [];
  for (const identity of identities) {
    const cmp = compare(record, identity);
    if (cmp.deterministic || cmp.score >= THRESHOLDS.probable) candidates.push({ id: identity.id, cmp });
  }
  const det = candidates.find((c) => c.cmp.deterministic);
  if (det && det.cmp.conflicted.includes("name") && det.cmp.conflicted.includes("birthDate")) {
    // a deterministic key on top of fully conflicted demographics is a data-integrity question
    return { status: "under-review", why: "det-conflict", candidates: [det.id], cmp: det.cmp };
  }
  if (det) return { status: "confirmed", method: "deterministic", identity: det.id, cmp: det.cmp };
  const prob = candidates.filter((c) => c.cmp.score >= THRESHOLDS.probable).sort((a, b) => b.cmp.score - a.cmp.score);
  if (prob.length >= 2) return { status: "under-review", why: "ambiguous", candidates: prob.map((p) => p.id), cmp: prob[0].cmp };
  if (prob.length === 1) {
    const c = prob[0];
    if (profile === "standard" && c.cmp.score >= THRESHOLDS.autoConfirmStandard)
      return { status: "confirmed", method: "probabilistic", identity: c.id, cmp: c.cmp };
    return { status: "under-review", why: "probable", candidates: [c.id], cmp: c.cmp };
  }
  return { status: "minted" };
}
