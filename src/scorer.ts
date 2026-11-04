/**
 * Scorer: each matcher's $member-match response against the digest-locked ground truth.
 *
 * Categories (brief task 8, plus the three ways to be wrong that aren't decoy confusion):
 *   correct
 *     true-match          expected a match, got that member
 *     correct-no-match    expected no-match 422, got a 422
 *     correct-multiple    expected multiple-matches 422, got a 422
 *     consent-constrained expected a consent 422, got a 422
 *   wrong
 *     decoy-confusion     returned a member when it shouldn't have, or the wrong member: records go to the wrong person
 *     consent-ignored     returned the right person despite a consent the payer can't honour
 *     missed-match        refused (422) where one member was the right answer
 *     error               no well-formed answer (HTTP 4xx/5xx other than 422, or no response)
 *
 * Rule (Nick, 2026-11-03): any 422 where a 422 is due counts as correct. When the 422's reason
 * differs from the expected one, the row is marked reasonMismatch so the label is visible.
 */
import type { ManifestEntry } from "./manifest.js";
import { REASON_SYSTEM } from "./fhir.js";

export const CATEGORIES = [
  "true-match", "correct-no-match", "correct-multiple", "consent-constrained",
  "decoy-confusion", "consent-ignored", "missed-match", "error",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const CORRECT = new Set<Category>(["true-match", "correct-no-match", "correct-multiple", "consent-constrained"]);

/** What each result means, in words a reader can use without the code. */
export const CATEGORY_INFO: Record<Category, { label: string; meaning: string }> = {
  "true-match": { label: "Found the right person", meaning: "One member was the person in the request, and the matcher returned that member." },
  "correct-no-match": { label: "Rightly refused: not this person", meaning: "The card and the person don't agree, so nobody should be returned. The matcher refused (HRex 422)." },
  "correct-multiple": { label: "Rightly refused: can't tell apart", meaning: "More than one member fits the request equally. HRex says refuse (422), and the matcher did." },
  "consent-constrained": { label: "Rightly refused: consent", meaning: "The consent sent with the request can't be honoured, so HRex says refuse (422). The matcher did." },
  "decoy-confusion": { label: "Wrong person", meaning: "The matcher returned a member who is not the person asking, or returned someone when it should have refused. This is how one person's records reach another." },
  "consent-ignored": { label: "Ignored consent", meaning: "The matcher returned the right person despite a consent the plan can't honour." },
  "missed-match": { label: "Missed the right person", meaning: "One member was the right answer, but the matcher refused. Safe, but the member's records don't move." },
  "error": { label: "No usable answer", meaning: "The matcher crashed or answered in a form that isn't a valid $member-match response." },
};

export interface Answer { status: number; body?: any; error?: string }
export type Observed =
  | { kind: "match"; memberIdentifier: string }
  | { kind: "refuse"; reason: string }
  | { kind: "error"; detail: string };

export interface Row {
  matcher: string;
  case: string;
  expected: string;
  expectedMember: string | null;
  observed: string;
  category: Category;
  reasonMismatch: boolean;
  wrongPerson: string | null;
  /** God view: who the request is really about. */
  subjectMemberId: string;
}

const EXPECTED_REASON: Record<string, string> = { "no-match-422": "no-match", "multiple-422": "multiple-matches", "consent-422": "consent" };

export function observe(a: Answer): Observed {
  if (a.error) return { kind: "error", detail: a.error };
  if (a.status === 200) {
    const p = a.body?.resourceType === "Parameters" ? a.body.parameter?.find((x: any) => x.name === "MemberIdentifier") : null;
    const v = p?.valueIdentifier?.value;
    const umb = p?.valueIdentifier?.type?.coding?.some((c: any) => c.code === "UMB");
    return v && umb ? { kind: "match", memberIdentifier: v } : { kind: "error", detail: "200 without a MemberIdentifier (UMB)" };
  }
  if (a.status === 422) {
    if (a.body?.resourceType !== "OperationOutcome") return { kind: "error", detail: "422 without an OperationOutcome" };
    const reason = a.body.issue?.[0]?.details?.coding?.find((c: any) => c.system === REASON_SYSTEM)?.code ?? a.body.issue?.[0]?.code ?? "unspecified";
    return { kind: "refuse", reason };
  }
  return { kind: "error", detail: `HTTP ${a.status}` };
}

export function scoreOne(matcher: string, e: ManifestEntry, a: Answer): Row {
  const o = observe(a);
  const base = { matcher, case: e.case, expected: e.outcome, expectedMember: e.memberIdentifier, reasonMismatch: false, wrongPerson: null as string | null, subjectMemberId: e.subjectMemberId };
  if (o.kind === "error") return { ...base, observed: `error: ${o.detail}`, category: "error" };
  if (o.kind === "match") {
    const observed = `match ${o.memberIdentifier}`;
    if (e.outcome === "match")
      return o.memberIdentifier === e.memberIdentifier
        ? { ...base, observed, category: "true-match" }
        : { ...base, observed, category: "decoy-confusion", wrongPerson: o.memberIdentifier };
    if (e.outcome === "consent-422") {
      // Returning anyone despite an unhonourable consent is a consent breach; returning the
      // wrong someone is also a wrong-person release, which outranks it.
      return o.memberIdentifier !== e.subjectMemberId
        ? { ...base, observed, category: "decoy-confusion", wrongPerson: o.memberIdentifier }
        : { ...base, observed, category: "consent-ignored" };
    }
    return { ...base, observed, category: "decoy-confusion", wrongPerson: o.memberIdentifier };
  }
  const observed = `422 ${o.reason}`;
  if (e.outcome === "match") return { ...base, observed, category: "missed-match" };
  const category: Category = e.outcome === "no-match-422" ? "correct-no-match" : e.outcome === "multiple-422" ? "correct-multiple" : "consent-constrained";
  return { ...base, observed, category, reasonMismatch: o.reason !== EXPECTED_REASON[e.outcome] };
}

export interface Scoreboard {
  manifestDigest: string;
  matchers: { matcher: string; counts: Record<Category, number>; correct: number; total: number }[];
  rows: Row[];
}

export function tally(rows: Row[], manifestDigest: string): Scoreboard {
  const names = [...new Set(rows.map((r) => r.matcher))];
  return {
    manifestDigest,
    matchers: names.map((matcher) => {
      const mine = rows.filter((r) => r.matcher === matcher);
      const counts = Object.fromEntries(CATEGORIES.map((c) => [c, mine.filter((r) => r.category === c).length])) as Record<Category, number>;
      return { matcher, counts, correct: mine.filter((r) => CORRECT.has(r.category)).length, total: mine.length };
    }),
    rows,
  };
}
