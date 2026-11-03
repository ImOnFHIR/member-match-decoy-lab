/** Parse HRex $member-match input Parameters into the fields matchers use. */
export interface MatchRequest {
  given: string;
  family: string;
  suffix?: string;
  birthDate?: string;
  gender?: string;
  memberId?: string;      // CoverageToMatch.identifier with type MB
  subscriberId?: string;  // CoverageToMatch.subscriberId
  consent?: { policy: string[]; period?: { start?: string; end?: string }; status?: string };
}

export class BadRequest extends Error {}

type Json = any;
export function parseRequest(p: Json): MatchRequest {
  if (p?.resourceType !== "Parameters" || !Array.isArray(p.parameter)) throw new BadRequest("body must be a Parameters resource");
  const get = (n: string) => p.parameter.filter((x: Json) => x.name === n).map((x: Json) => x.resource);
  const [patient] = get("MemberPatient");
  const [coverage] = get("CoverageToMatch");
  const [consent] = get("Consent");
  if (get("MemberPatient").length !== 1) throw new BadRequest("exactly one MemberPatient is required");
  if (get("CoverageToMatch").length !== 1) throw new BadRequest("exactly one CoverageToMatch is required");
  if (patient?.resourceType !== "Patient") throw new BadRequest("MemberPatient must be a Patient");
  if (coverage?.resourceType !== "Coverage") throw new BadRequest("CoverageToMatch must be a Coverage");
  const name = patient.name?.[0] ?? {};
  const mb = (coverage.identifier ?? []).find((i: Json) => i.type?.coding?.some((c: Json) => c.code === "MB"));
  return {
    given: (name.given ?? []).join(" "),
    family: name.family ?? "",
    ...(name.suffix?.length ? { suffix: name.suffix.join(" ") } : {}),
    birthDate: patient.birthDate,
    gender: patient.gender,
    ...(mb?.value ? { memberId: mb.value } : {}),
    ...(coverage.subscriberId ? { subscriberId: coverage.subscriberId } : {}),
    ...(consent ? { consent: { policy: (consent.policy ?? []).map((x: Json) => x.uri), period: consent.provision?.period, status: consent.status } } : {}),
  };
}
