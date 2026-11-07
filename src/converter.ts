/**
 * Converter: a decoy case → HRex $member-match input Parameters.
 * Profiles: hrex-parameters-member-match-in (HRex 1.2.0).
 * mm-6: Coverage and Consent references are local "Patient/<id>" resolving to MemberPatient.
 * Synthetic data only.
 */
import { createHash } from "node:crypto";
import type { Case, DecoySet } from "./decoys.js";

/**
 * Opaque, deterministic token for a case. Case names ("D4-card-mixup") must never appear in a
 * request: they would tell any matcher, and especially the LLM, what the trap is.
 */
export const opaque = (caseId: string) =>
  createHash("sha256").update(`mmdl:${caseId}`).digest("hex").slice(0, 10);

export { HREX, SYN, POLICY } from "./synthetic-ns.js";
import { HREX, SYN, POLICY } from "./synthetic-ns.js";

const OLD_PLAN = {
  identifier: { system: `${SYN}/payer-id`, value: "SYN-PAYER-OLD" },
  display: "Synthetic Old Plan",
};
const NEW_PLAN = {
  identifier: { system: `${SYN}/payer-id`, value: "SYN-PAYER-NEW" },
  display: "Synthetic New Plan",
};

type Json = Record<string, unknown>;

export function toMemberMatchParameters(set: DecoySet, c: Case): Json {
  const person = set.people.find((p) => p.id === c.request.patient);
  if (!person) throw new Error(`${c.id}: unknown patient ${c.request.patient}`);
  const [given, ...rest] = person.name.split(" ");
  const family = rest.join(" ");
  const patientId = "member";

  const name: Json = { use: "official", family, given: [c.request.givenOverride ?? given] };
  if (person.suffix && !c.request.dropSuffix) name.suffix = [person.suffix];

  const patient: Json = {
    resourceType: "Patient",
    id: patientId,
    meta: { profile: [`${HREX}/hrex-patient-demographics`] },
    // US Core Patient (which Consent.patient must meet) requires an identifier. Use the
    // requesting (new) plan's own synthetic member number, never the target plan's.
    identifier: [{ system: `${SYN}/new-plan-member-id`, value: `SYN-NEW-${opaque(c.id)}` }],
    name: [name],
    gender: person.gender,
    birthDate: person.birthDate,
  };

  const identifier = c.request.card.memberId
    ? [
        {
          type: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MB" }],
          },
          system: `${SYN}/member-id`,
          value: c.request.card.memberId,
        },
      ]
    : undefined;

  const coverage: Json = {
    resourceType: "Coverage",
    id: "coverage-to-match",
    meta: { profile: [`${HREX}/hrex-coverage`] },
    ...(identifier ? { identifier } : {}),
    status: "active",
    ...(c.request.card.subscriberId ? { subscriberId: c.request.card.subscriberId } : {}),
    beneficiary: { reference: `Patient/${patientId}` },
    // The card does not state the relationship; HRex requires the element, so mark it absent.
    relationship: {
      coding: [
        { system: "http://terminology.hl7.org/CodeSystem/data-absent-reason", code: "unknown" },
      ],
    },
    payor: [OLD_PLAN],
  };

  const parameter: Json[] = [
    { name: "MemberPatient", resource: patient },
    { name: "CoverageToMatch", resource: coverage },
  ];

  if (c.request.consent !== "none") {
    const period = set.consentPeriods[c.request.consent];
    parameter.push({
      name: "Consent",
      resource: {
        resourceType: "Consent",
        id: "consent",
        meta: { profile: [`${HREX}/hrex-consent`] },
        status: "active",
        scope: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/consentscope",
              code: "patient-privacy",
            },
          ],
        },
        category: [
          {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IDSCL" }],
          },
        ],
        patient: { reference: `Patient/${patientId}` },
        performer: [{ reference: `Patient/${patientId}` }],
        sourceReference: { reference: `${SYN}/DocumentReference/consent-${opaque(c.id)}` },
        policy: [{ uri: c.request.consent === "regular" ? POLICY.regular : POLICY.sensitive }],
        provision: {
          type: "permit",
          period,
          actor: [
            {
              role: {
                coding: [
                  {
                    system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
                    code: "performer",
                  },
                ],
              },
              reference: OLD_PLAN,
            },
            {
              role: {
                coding: [
                  {
                    system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                    code: "IRCP",
                  },
                ],
              },
              reference: NEW_PLAN,
            },
          ],
          action: [
            {
              coding: [
                { system: "http://terminology.hl7.org/CodeSystem/consentaction", code: "disclose" },
              ],
            },
          ],
        },
      },
    });
  }

  return {
    resourceType: "Parameters",
    id: `req-${opaque(c.id)}`,
    meta: { profile: [`${HREX}/hrex-parameters-member-match-in`] },
    parameter,
  };
}
