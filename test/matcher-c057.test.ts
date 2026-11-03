import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { loadDecoys } from "../src/decoys.js";
import { roster } from "../src/population.js";
import { createEndpoint, type DecisionLog } from "../src/server.js";
import { c057Matcher } from "../src/matchers/c057/index.js";
import { levenshtein, nameSim, dobSim } from "../src/matchers/c057/compare.js";
import { decide } from "../src/matchers/c057/decide.js";
import { REASON_SYSTEM } from "../src/fhir.js";

const set = loadDecoys();
const logs: DecisionLog[] = [];
const server = createEndpoint({
  matchers: [c057Matcher()],
  roster: roster(set),
  consent: { asOf: set.asOf, canSegmentSensitive: set.targetPayer.canSegmentSensitive },
  log: (e) => logs.push(e),
});
let base = "";
before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const post = async (path: string, body: unknown) => {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/fhir+json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, type: res.headers.get("content-type"), body: (await res.json()) as any };
};
const fixture = (id: string) => JSON.parse(readFileSync(`fixtures/requests/${id}.json`, "utf8"));

function assertWellFormed(r: { status: number; body: any }) {
  if (r.status === 200) {
    assert.equal(r.body.resourceType, "Parameters");
    const mi = r.body.parameter.find((p: any) => p.name === "MemberIdentifier");
    assert.equal(mi.valueIdentifier.type.coding[0].code, "UMB");
    assert.match(mi.valueIdentifier.value, /^SYN-MEM-/);
  } else {
    assert.equal(r.status, 422);
    assert.equal(r.body.resourceType, "OperationOutcome");
    assert.ok(r.body.issue.length >= 1);
    for (const i of r.body.issue) {
      assert.equal(i.severity, "error");
      assert.ok(i.code);
      assert.equal(i.details.coding[0].system, REASON_SYSTEM);
      assert.ok(i.details.text);
    }
  }
}

// Observed C-057 behaviour at 7422a34 under the lab's settings. Not the ground truth: the
// scorer (task 8) compares these against the manifest. A change here is a behaviour change.
const OBSERVED: Record<string, [number, string]> = {
  "D0-control": [200, "SYN-MEM-1001-01"],
  "D1-senior-junior": [422, "review-required"],
  "D2-twins": [422, "multiple-matches"],
  "D3-consent-expired": [422, "consent"],
  "D3b-consent-unsegmentable": [422, "consent"],
  "D4-card-mixup": [422, "review-required"],
};

for (const c of set.cases) {
  test(`matcher-c057 ${c.id}: endpoint answers, response well-formed`, async () => {
    const r = await post("/c057/Patient/$member-match", fixture(c.id));
    assert.equal(r.type, "application/fhir+json");
    assertWellFormed(r);
    const [status, what] = OBSERVED[c.id];
    assert.equal(r.status, status);
    if (status === 200) assert.equal(r.body.parameter[0].valueIdentifier.value, what);
    else assert.equal(r.body.issue[0].details.coding[0].code, what);
  });
}

test("matcher-c057: every decision is logged with a rationale", () => {
  assert.ok(logs.length >= set.cases.length);
  for (const l of logs) assert.ok(l.rationale.length > 0);
});

test("matcher-c057: short route, bad JSON, wrong resource, unknown matcher", async () => {
  assert.equal((await post("/c057/$member-match", fixture("D0-control"))).status, 200);
  assert.equal((await post("/c057/$member-match", "{not json")).status, 400);
  assert.equal((await post("/c057/$member-match", { resourceType: "Patient" })).status, 400);
  assert.equal((await post("/nope/$member-match", fixture("D0-control"))).status, 404);
});

// Port fidelity: values computed by the original matcher.mjs formulas.
test("matcher-c057 port: similarity functions", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(nameSim("John Roe", "Jon Roe"), 1 - 1 / 8);
  assert.equal(dobSim("1951-09-02", "1951-09-10"), 1 - 8 / 30);
  assert.equal(dobSim("1951-09-02", "1951-11-02"), 0);
});

test("matcher-c057 port: decision branches", () => {
  const ids = [
    { id: "a", attributes: [{ name: "Ann Lee", birthDate: "1990-01-01", memberId: "M1" }] },
    { id: "b", attributes: [{ name: "Ann Lea", birthDate: "1990-01-01", memberId: "M2" }] },
  ];
  assert.equal(decide({ name: "Ann Lee", birthDate: "1990-01-01", memberId: "M1" }, ids, "standard").status, "confirmed");
  const conflict = decide({ name: "Zed Q", birthDate: "1950-06-06", memberId: "M1" }, ids, "standard");
  assert.equal(conflict.status, "under-review");
  assert.equal((conflict as any).why, "det-conflict");
  assert.deepEqual((conflict as any).candidates, ["a"]);
  assert.equal((decide({ name: "Ann Le", birthDate: "1990-01-01" }, ids, "standard") as any).why, "ambiguous");
  assert.equal(decide({ name: "Nobody", birthDate: "1900-01-01" }, ids, "standard").status, "minted");
  const one = [ids[0]];
  assert.equal(decide({ name: "Ann Lee", birthDate: "1990-01-01" }, one, "standard").status, "confirmed");
  assert.equal((decide({ name: "Ann Lee", birthDate: "1990-01-01" }, one, "conservative") as any).why, "probable");
});
