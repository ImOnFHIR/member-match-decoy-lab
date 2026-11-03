import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadDecoys } from "../src/decoys.js";
import { toMemberMatchParameters, POLICY } from "../src/converter.js";

const set = loadDecoys();
const byId = (id: string) => set.cases.find((c) => c.id === id)!;
const param = (p: any, name: string) => p.parameter.find((x: any) => x.name === name)?.resource;

for (const c of set.cases) {
  const p: any = toMemberMatchParameters(set, c);

  test(`converter ${c.id}: HRex parameter names and profiles`, () => {
    assert.equal(p.resourceType, "Parameters");
    assert.deepEqual(p.meta.profile, ["http://hl7.org/fhir/us/davinci-hrex/StructureDefinition/hrex-parameters-member-match-in"]);
    const names = p.parameter.map((x: any) => x.name);
    assert.deepEqual(names.slice(0, 2), ["MemberPatient", "CoverageToMatch"]);
    assert.equal(names.includes("Consent"), c.request.consent !== "none");
  });

  test(`converter ${c.id}: mm-6 local references resolve to MemberPatient`, () => {
    const ref = `Patient/${param(p, "MemberPatient").id}`;
    assert.equal(param(p, "CoverageToMatch").beneficiary.reference, ref);
    const consent = param(p, "Consent");
    if (consent) assert.equal(consent.patient.reference, ref);
  });

  test(`converter ${c.id}: every identifier is synthetic`, () => {
    const values = JSON.stringify(p).match(/"value":\s*"[^"]*"/g) ?? [];
    for (const v of values) assert.match(v, /"SYN-/, v);
  });

  test(`converter ${c.id}: committed fixture matches a fresh conversion`, () => {
    const onDisk = JSON.parse(readFileSync(`fixtures/requests/${c.id}.json`, "utf8"));
    assert.deepEqual(onDisk, p, "run `npm run convert` and commit");
  });
}

test("converter D1: request drops the Jr. suffix and carries only the subscriber ID", () => {
  const p: any = toMemberMatchParameters(set, byId("D1-senior-junior"));
  const name = param(p, "MemberPatient").name[0];
  assert.equal(name.suffix, undefined);
  assert.deepEqual(name.given, ["Rowan"]);
  const cov = param(p, "CoverageToMatch");
  assert.equal(cov.subscriberId, "SYN-SUB-2001");
  assert.equal(cov.identifier, undefined);
});

test("converter D2: twins request carries the initial only", () => {
  const p: any = toMemberMatchParameters(set, byId("D2-twins"));
  assert.deepEqual(param(p, "MemberPatient").name[0].given, ["A"]);
});

test("converter D3: consent period ended before asOf", () => {
  const p: any = toMemberMatchParameters(set, byId("D3-consent-expired"));
  assert.ok(param(p, "Consent").provision.period.end < set.asOf);
});

test("converter D3b: #regular policy; D0: #sensitive policy", () => {
  assert.equal(param(toMemberMatchParameters(set, byId("D3b-consent-unsegmentable")), "Consent").policy[0].uri, POLICY.regular);
  assert.equal(param(toMemberMatchParameters(set, byId("D0-control")), "Consent").policy[0].uri, POLICY.sensitive);
});

test("converter D4: John's demographics with Jon's member ID", () => {
  const p: any = toMemberMatchParameters(set, byId("D4-card-mixup"));
  assert.equal(param(p, "MemberPatient").birthDate, "1951-09-02");
  assert.equal(param(p, "CoverageToMatch").identifier[0].value, "SYN-MEM-1002-01");
});
