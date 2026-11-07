/**
 * Ground-truth manifest (the god view): for each case, the correct outcome, plus a hash of
 * the exact request it applies to. The whole manifest is digest-locked so that an answer
 * can't be changed quietly after a matcher has been scored.
 */
import { createHash } from "node:crypto";
import type { DecoySet } from "./decoys.js";
import { toMemberMatchParameters } from "./converter.js";

/** Canonical JSON: keys sorted at every depth, no whitespace. Stable across runs and machines. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ManifestEntry {
  case: string;
  survivesIdMatch: boolean;
  outcome: string;
  member: string | null;
  memberIdentifier: string | null;
  /** God view: the member the request is really about, even when the right answer is a 422. */
  subjectMemberId: string;
  requestSha256: string;
}
export interface Manifest {
  manifestVersion: 1;
  ig: "hl7.fhir.us.davinci-hrex#1.2.0";
  asOf: string;
  targetPayer: { canSegmentSensitive: boolean };
  entries: ManifestEntry[];
}

export function buildManifest(set: DecoySet): Manifest {
  return {
    manifestVersion: 1,
    ig: "hl7.fhir.us.davinci-hrex#1.2.0",
    asOf: set.asOf,
    targetPayer: { canSegmentSensitive: set.targetPayer.canSegmentSensitive },
    entries: set.cases
      .map((c) => ({
        case: c.id,
        survivesIdMatch: c.survivesIdMatch,
        outcome: c.expected.outcome,
        member: c.expected.member ?? null,
        memberIdentifier: c.expected.memberIdentifier ?? null,
        subjectMemberId: subjectOf(set, c.request.patient),
        requestSha256: sha256(canonical(toMemberMatchParameters(set, c))),
      }))
      .sort((a, b) => a.case.localeCompare(b.case)),
  };
}

function subjectOf(set: DecoySet, personId: string): string {
  const covs = set.coverages.filter((c) => c.beneficiary === personId);
  if (covs.length !== 1)
    throw new Error(`${personId}: expected exactly one coverage, found ${covs.length}`);
  return covs[0].memberId;
}

export const manifestDigest = (m: Manifest) => sha256(canonical(m));
