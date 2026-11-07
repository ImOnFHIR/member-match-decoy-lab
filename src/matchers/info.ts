/** Plain names and settings for every matcher. Node-free (no AI or spend code). */
export const DEFAULT_RELAXED_CONFIDENCE = 85;

/** short: ≤ 10 words, for lists. summary: one or two sentences, for details. */
export interface MatcherInfo {
  id: string;
  label: string;
  short: string;
  summary: string;
  costsMoney: boolean;
}

export const MATCHER_INFO: MatcherInfo[] = [
  {
    id: "identity-strict",
    label: "Identity matcher, strict",
    costsMoney: false,
    short: "Nick's matcher (C-057); accepts look-alikes only at 90%+.",
    summary:
      "Nick's event-sourced identity matcher (C-057) at its own setting: accepts a look-alike only when it is at least 90% sure; otherwise sends it to human review.",
  },
  {
    id: "identity-relaxed",
    label: "Identity matcher, relaxed",
    costsMoney: false,
    short: "Same matcher; accepts look-alikes at a level you set.",
    summary: "The same matcher, but it accepts a look-alike at a confidence you set (default 85%).",
  },
  {
    id: "id-first",
    label: "ID-first rules",
    costsMoney: false,
    short: "Trusts the ID on the card first.",
    summary:
      "Trusts the member or subscriber ID on the card; uses name, birth date and gender only to break ties. A common way to build member match.",
  },
  {
    id: "check-every-field",
    label: "Check-every-field rules",
    costsMoney: false,
    short: "ID, name, birth date and gender must all agree.",
    summary:
      "Finds the card's ID, then insists that name, birth date and gender all agree, even when the ID already picked one person.",
  },
  {
    id: "ai-with-rules",
    label: "AI adjudicator, with rules",
    costsMoney: true,
    short: "Claude decides, given the HRex rules.",
    summary:
      "Claude reads the request and the member list, given the HRex matching rules. No helper code.",
  },
  {
    id: "ai-with-definitions",
    label: "AI adjudicator, rules and consent codes",
    costsMoney: true,
    short: "Claude decides, given the rules and HRex's consent-code definitions.",
    summary:
      "The same as with rules, plus HRex's own definitions of the two consent codes (#regular, #sensitive), which the model misread without them.",
  },
  {
    id: "ai-no-rules",
    label: "AI adjudicator, no rules",
    costsMoney: true,
    short: "Claude decides, given no rules.",
    summary:
      "The same, but told nothing about the HRex rules: what does the model know on its own?",
  },
];

export const infoFor = (id: string) => MATCHER_INFO.find((m) => m.id === id);
export const labelFor = (id: string) => infoFor(id)?.label ?? id;

/** RELAXED_CONFIDENCE as a percentage (75–100) → C-057's 0–1 auto-confirm line. */
export function relaxedConfidence(env: Record<string, string | undefined>): number {
  const raw = env.RELAXED_CONFIDENCE;
  const pct = raw === undefined || raw === "" ? DEFAULT_RELAXED_CONFIDENCE : Number(raw);
  if (!Number.isFinite(pct) || pct < 75 || pct > 100)
    throw new Error(`RELAXED_CONFIDENCE must be a percentage from 75 to 100; got "${raw}"`);
  return pct / 100;
}
