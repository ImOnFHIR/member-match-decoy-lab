/** HRex $member-match responses: 200 Parameters (hrex-parameters-member-match-out) or 422 OperationOutcome. */
import { SYN } from "./synthetic-ns.js";

/** Lab reason codes carried in OperationOutcome.issue.details so the scorer can tell refusals apart. */
export const REASON_SYSTEM = `${SYN}/member-match-reason`;
export type Reason =
  "no-match" | "multiple-matches" | "consent" | "review-required" | "bad-request";

export function matchResponse(memberId: string) {
  return {
    resourceType: "Parameters",
    meta: {
      profile: [
        "http://hl7.org/fhir/us/davinci-hrex/StructureDefinition/hrex-parameters-member-match-out",
      ],
    },
    parameter: [
      {
        name: "MemberIdentifier",
        valueIdentifier: {
          type: {
            coding: [
              { system: "http://hl7.org/fhir/us/davinci-hrex/CodeSystem/hrex-temp", code: "UMB" },
            ],
          },
          system: `${SYN}/member-id`,
          value: memberId,
          assigner: { display: "Synthetic Old Plan" },
        },
      },
    ],
  };
}

export function refusal(reason: Reason, text: string) {
  return {
    resourceType: "OperationOutcome",
    issue: [
      {
        severity: "error",
        code:
          reason === "bad-request"
            ? "invalid"
            : reason === "consent"
              ? "forbidden"
              : reason === "multiple-matches"
                ? "multiple-matches"
                : reason === "review-required"
                  ? "processing"
                  : "not-found",
        details: { coding: [{ system: REASON_SYSTEM, code: reason }], text },
      },
    ],
  };
}
