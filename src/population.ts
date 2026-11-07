/**
 * The target payer's member roster: what the payer itself knows about its members.
 * Built from decoys.json people + coverages. It never includes expected answers;
 * matchers must not read `cases` or the manifest (enforced in test/no-god-view.test.ts).
 */
import type { DecoySet } from "./decoys.js";

export interface Member {
  memberId: string; // the payer's unique member identifier (returned as UMB)
  subscriberId: string;
  relationship: string;
  given: string;
  family: string;
  suffix?: string;
  birthDate: string;
  gender: string;
}

export function roster(set: Pick<DecoySet, "people" | "coverages">): Member[] {
  return set.coverages.map((c) => {
    const p = set.people.find((x) => x.id === c.beneficiary);
    if (!p) throw new Error(`coverage ${c.id}: unknown beneficiary`);
    const [given, ...rest] = p.name.split(" ");
    return {
      memberId: c.memberId,
      subscriberId: c.subscriberId,
      relationship: c.relationship,
      given,
      family: rest.join(" "),
      ...(p.suffix ? { suffix: p.suffix } : {}),
      birthDate: p.birthDate,
      gender: p.gender,
    };
  });
}

export const fullName = (m: { given: string; family: string; suffix?: string }) =>
  [m.given, m.family, m.suffix].filter(Boolean).join(" ");
