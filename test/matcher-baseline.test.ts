import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadDecoys } from "../src/decoys.js";
import { roster } from "../src/population.js";
import { handle } from "../src/server.js";
import { baselineMatcher } from "../src/matchers/baseline/index.js";
import { buildMatchers, MATCHER_INFO, relaxedConfidence } from "../src/matchers/registry.js";
import { REASON_SYSTEM } from "../src/fhir.js";

const set = loadDecoys();
const opts = { matchers: [baselineMatcher("tiered"), baselineMatcher("strict")], roster: roster(set), consent: { asOf: set.asOf, canSegmentSensitive: set.targetPayer.canSegmentSensitive } };
const fixture = (id: string) => JSON.parse(readFileSync(`fixtures/requests/${id}.json`, "utf8"));
const run = (m: string, id: string) => handle(opts, m, fixture(id));
const outcome = (r: any) => r.status === 200 ? r.body.parameter[0].valueIdentifier.value : r.body.issue[0].details.coding[0].code;

// Observed behaviour, not ground truth (the scorer compares with the manifest).
const OBSERVED: Record<string, Record<string, string>> = {
  "id-first": {
    "D0-control": "SYN-MEM-1001-01", "D1-senior-junior": "SYN-MEM-2001-02", "D2-twins": "no-match",
    "D3-consent-expired": "consent", "D3b-consent-unsegmentable": "consent",
    "D4-card-mixup": "SYN-MEM-1002-01", // trusts the member ID: returns the decoy (Jon) for John's request
  },
  "check-every-field": {
    "D0-control": "SYN-MEM-1001-01", "D1-senior-junior": "SYN-MEM-2001-02", "D2-twins": "no-match",
    "D3-consent-expired": "consent", "D3b-consent-unsegmentable": "consent", "D4-card-mixup": "no-match",
  },
};

for (const [m, cases] of Object.entries(OBSERVED)) {
  for (const [id, want] of Object.entries(cases)) {
    test(`matcher-baseline ${m} ${id}: ${want}`, async () => {
      const r: any = await run(m, id);
      assert.equal(outcome(r), want, r.log.rationale);
      if (r.status === 422) {
        assert.equal(r.body.resourceType, "OperationOutcome");
        assert.equal(r.body.issue[0].details.coding[0].system, REASON_SYSTEM);
      } else assert.equal(r.body.parameter[0].valueIdentifier.type.coding[0].code, "UMB");
      assert.ok(r.log.rationale);
    });
  }
}

const base = { given: "Ann", family: "Lee", birthDate: "1990-01-01", gender: "female" };
const pop = [
  { memberId: "M1", subscriberId: "S1", relationship: "self", given: "Ann", family: "Lee", birthDate: "1990-01-01", gender: "female" },
  { memberId: "M2", subscriberId: "S1", relationship: "child", given: "Ann", family: "Lee", birthDate: "1990-01-01", gender: "female" },
];
const payer = { asOf: "2026-11-01", canSegmentSensitive: false };

test("matcher-baseline: refuses multiple matches per HRex (mm-10)", () => {
  const d = baselineMatcher("tiered").decide({ ...base, subscriberId: "S1" }, pop, payer) as any;
  assert.equal(d.kind, "refuse");
  assert.equal(d.reason, "multiple-matches");
});
test("matcher-baseline: no identifier on the card is a no-match (deterministic minimum)", () => {
  assert.equal((baselineMatcher("tiered").decide(base, pop, payer) as any).reason, "no-match");
});
test("matcher-baseline: request suffix must agree when present", () => {
  const p = [{ ...pop[0], suffix: "Sr" }, { ...pop[1], suffix: "Jr", birthDate: "2010-01-01" }];
  assert.equal((baselineMatcher("strict").decide({ ...base, suffix: "Jr", birthDate: "1990-01-01", subscriberId: "S1" }, p, payer) as any).reason, "no-match");
});

test("registry: plain names; RELAXED_CONFIDENCE is a percentage from 75 to 100", () => {
  assert.deepEqual(buildMatchers({}).map((m) => m.name), ["identity-strict", "identity-relaxed", "id-first", "check-every-field"]);
  for (const m of buildMatchers({})) assert.ok(MATCHER_INFO.some((i) => i.id === m.name && i.label && i.summary), m.name);
  assert.equal(relaxedConfidence({}), 0.85);
  assert.equal(relaxedConfidence({ RELAXED_CONFIDENCE: "90" }), 0.9);
  for (const bad of ["abc", "50", "0.85", "120"]) assert.throws(() => buildMatchers({ RELAXED_CONFIDENCE: bad }), /75 to 100/, bad);
});
