import { readFileSync } from "node:fs";

export type Outcome = "match" | "no-match-422" | "multiple-422" | "consent-422";
export type ConsentKind = "valid" | "expired" | "regular" | "none";

export interface Person { id: string; source: string; name: string; suffix?: string; birthDate: string; gender: "male" | "female" | "other" | "unknown" }
export interface CoverageRec { id: string; subscriberId: string; memberId: string; beneficiary: string; relationship: string }
export interface Case {
  id: string;
  title: string;
  /** One plain sentence (≤ 20 words) for people: the report, the page, the video. */
  plain: string;
  request: { patient: string; card: { subscriberId?: string; memberId?: string }; consent: ConsentKind; givenOverride?: string; dropSuffix?: boolean };
  trap: string;
  survivesIdMatch: boolean;
  expected: { outcome: Outcome; member?: string; memberIdentifier?: string };
}
export interface DecoySet {
  status: string;
  asOf: string;
  outcomes: Outcome[];
  targetPayer: { canSegmentSensitive: boolean };
  consentPeriods: Record<Exclude<ConsentKind, "none">, { start: string; end: string }>;
  people: Person[];
  coverages: CoverageRec[];
  cases: Case[];
}

export function loadDecoys(path = "decoys/decoys.json"): DecoySet {
  return JSON.parse(readFileSync(path, "utf8")) as DecoySet;
}
