/**
 * The scoreboard in words: what happened, to whom, and why it matters.
 * Shared by `npm run score`, the MCP tool's text output and the HTML page.
 * Names are the synthetic people from decoys/decoys.json.
 */
import type { DecoySet } from "./decoys.js";
import { CATEGORIES, CATEGORY_INFO, CORRECT, type Category, type Row, type Scoreboard } from "./scorer.js";
import { labelFor, infoFor } from "./matchers/registry.js";
import { SYNTHETIC_BANNER } from "./index.js";

const REASON_WORDS: Record<string, string> = {
  "no-match": "no match", "multiple-matches": "more than one match", consent: "consent",
  "review-required": "needs human review", "bad-request": "bad request",
};
export const reasonWords = (r: string) => REASON_WORDS[r] ?? r;
const EXPECTED_REASON: Record<string, string> = { "no-match-422": "no-match", "multiple-422": "multiple-matches", "consent-422": "consent" };

/** memberId → "Jon Roe" (suffix kept: "Rowan Quill Jr"). */
export function nameIndex(set: DecoySet): (memberId: string | null | undefined) => string {
  const byPerson = new Map(set.people.map((p) => [p.id, [p.name, p.suffix].filter(Boolean).join(" ")]));
  const byMember = new Map(set.coverages.map((c) => [c.memberId, byPerson.get(c.beneficiary) ?? c.memberId]));
  return (id) => (id ? byMember.get(id) ?? id : "nobody");
}

export function rightAnswer(expected: string, expectedMember: string | null, name: (id: string | null) => string): string {
  switch (expected) {
    case "match": return `Return ${name(expectedMember)} (${expectedMember}).`;
    case "no-match-422": return "Refuse (HRex 422): the card and the person don't agree.";
    case "multiple-422": return "Refuse (HRex 422): more than one member fits.";
    case "consent-422": return "Refuse (HRex 422): the consent can't be honoured.";
    default: return expected;
  }
}

/** One sentence for a row, written for a reader. */
export function explain(r: Row, name: (id: string | null) => string): string {
  const subject = name(r.subjectMemberId);
  switch (r.category) {
    case "true-match": return `Found ${subject}.`;
    case "correct-no-match":
    case "correct-multiple":
    case "consent-constrained": {
      const said = r.observed.replace(/^422 /, "");
      return r.reasonMismatch
        ? `Refused, giving the reason "${reasonWords(said)}" rather than "${reasonWords(EXPECTED_REASON[r.expected])}". Still the safe answer.`
        : `Refused (${reasonWords(said)}), as HRex requires.`;
    }
    case "decoy-confusion":
      return r.wrongPerson === r.subjectMemberId
        ? `Returned ${subject} although it should have refused: another member fits just as well.`
        : `Sent ${name(r.wrongPerson)}'s records in answer to a request for ${subject}.`;
    case "consent-ignored": return `Returned ${subject}'s records despite a consent the plan can't honour.`;
    case "missed-match": return `Refused (${reasonWords(r.observed.replace(/^422 /, ""))}), but ${name(r.expectedMember)} was the right answer.`;
    case "error": return `No usable answer (${r.observed.replace(/^error: /, "")}).`;
  }
}

export interface FriendlyScoreboard extends Scoreboard {
  banner: string;
  headline: string;
  matchers: (Scoreboard["matchers"][number] & { label: string; summary: string })[];
  rows: (Row & { title: string; plain: string; result: string; explanation: string; rightAnswer: string })[];
}

export function headline(sb: Scoreboard): string {
  const n = sb.matchers.length;
  const wrong = sb.matchers.filter((m) => m.counts["decoy-confusion"] > 0);
  if (wrong.length === 0) return `None of the ${n} matchers sent records to the wrong person.`;
  const who = wrong.map((m) => labelFor(m.matcher)).join(", ");
  return `${wrong.length} of ${n} matchers sent someone's records to the wrong person: ${who}.`;
}

export function befriend(sb: Scoreboard, set: DecoySet): FriendlyScoreboard {
  const name = nameIndex(set);
  const caseOf = new Map(set.cases.map((c) => [c.id, c]));
  return {
    ...sb,
    banner: SYNTHETIC_BANNER,
    headline: headline(sb),
    matchers: sb.matchers.map((m) => ({ ...m, label: labelFor(m.matcher), summary: infoFor(m.matcher)?.summary ?? "" })),
    rows: sb.rows.map((r) => ({
      ...r,
      title: caseOf.get(r.case)?.title ?? r.case,
      plain: caseOf.get(r.case)?.plain ?? "",
      result: CATEGORY_INFO[r.category].label,
      explanation: explain(r, name),
      rightAnswer: rightAnswer(r.expected, r.expectedMember, name),
    })),
  };
}

const mark = (c: Category) => (CORRECT.has(c) ? "✓" : "✗");

/** The full plain-English report as text (terminal and MCP). */
export function renderText(f: FriendlyScoreboard): string {
  const out: string[] = [f.banner, "", f.headline, ""];
  out.push("HOW EACH MATCHER DID");
  for (const m of f.matchers) {
    out.push("", `${m.label}: ${m.correct} of ${m.total} right`, `  ${m.summary}`);
    for (const r of f.rows.filter((x) => x.matcher === m.matcher && (!CORRECT.has(x.category) || x.reasonMismatch)))
      out.push(`  ${mark(r.category)} ${r.title}: ${r.explanation}`);
  }
  out.push("", "", "THE DECOYS");
  for (const id of [...new Set(f.rows.map((r) => r.case))]) {
    const rows = f.rows.filter((r) => r.case === id);
    out.push("", `${rows[0].title}  [${id}]`, `  ${rows[0].plain}`, `  Right answer: ${rows[0].rightAnswer}`);
    for (const r of rows) out.push(`    ${mark(r.category)} ${labelFor(r.matcher)}: ${r.explanation}`);
  }
  out.push("", "", "WHAT THE RESULTS MEAN");
  for (const c of CATEGORIES) out.push(`  ${mark(c)} ${CATEGORY_INFO[c].label}: ${CATEGORY_INFO[c].meaning}`);
  out.push("", `Scored against the locked answer key ${f.manifestDigest.slice(0, 12)}. Any HRex 422 refusal where a refusal is due counts as right.`);
  return out.join("\n");
}
