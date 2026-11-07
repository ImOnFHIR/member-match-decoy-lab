import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreOne, tally, observe, CATEGORIES, type Answer } from "../src/scorer.js";
import { matchResponse, refusal } from "../src/fhir.js";
import { runScoreboard, ManifestLockError } from "../src/run.js";
import { buildMatchers } from "../src/matchers/registry.js";
import type { ManifestEntry } from "../src/manifest.js";

const entry = (
  outcome: string,
  member: string | null,
  subject = member ?? "SYN-MEM-S",
): ManifestEntry => ({
  case: "X",
  survivesIdMatch: true,
  outcome,
  member: member ? "p" : null,
  memberIdentifier: member,
  subjectMemberId: subject,
  requestSha256: "h",
});
const ok = (id: string): Answer => ({ status: 200, body: matchResponse(id) });
const no = (reason: any): Answer => ({ status: 422, body: refusal(reason, "t") });
const cat = (e: ManifestEntry, a: Answer) => scoreOne("m", e, a);

// Golden: one assertion per outcome category.
test("scorer golden: true match", () =>
  assert.equal(cat(entry("match", "A"), ok("A")).category, "true-match"));
test("scorer golden: wrong member on a match case is decoy confusion", () => {
  const r = cat(entry("match", "A"), ok("B"));
  assert.equal(r.category, "decoy-confusion");
  assert.equal(r.wrongPerson, "B");
});
test("scorer golden: refusing a match case is a missed match", () =>
  assert.equal(cat(entry("match", "A"), no("review-required")).category, "missed-match"));
test("scorer golden: correct no-match", () => {
  const r = cat(entry("no-match-422", null, "J"), no("no-match"));
  assert.equal(r.category, "correct-no-match");
  assert.equal(r.reasonMismatch, false);
});
test("scorer golden: any 422 where a 422 is due is correct, reason mismatch flagged", () => {
  const r = cat(entry("no-match-422", null, "J"), no("review-required"));
  assert.equal(r.category, "correct-no-match");
  assert.equal(r.reasonMismatch, true);
});
test("scorer golden: a match on a no-match case is decoy confusion", () =>
  assert.equal(cat(entry("no-match-422", null, "J"), ok("JON")).category, "decoy-confusion"));
test("scorer golden: correct refusal on multiple matches", () =>
  assert.equal(
    cat(entry("multiple-422", null, "ADA"), no("multiple-matches")).category,
    "correct-multiple",
  ));
test("scorer golden: picking one twin is decoy confusion, even the subject", () => {
  assert.equal(cat(entry("multiple-422", null, "ADA"), ok("AYA")).category, "decoy-confusion");
  assert.equal(cat(entry("multiple-422", null, "ADA"), ok("ADA")).category, "decoy-confusion");
});
test("scorer golden: consent-constrained", () =>
  assert.equal(
    cat(entry("consent-422", null, "J"), no("consent")).category,
    "consent-constrained",
  ));
test("scorer golden: returning the subject despite consent is consent-ignored", () =>
  assert.equal(cat(entry("consent-422", null, "J"), ok("J")).category, "consent-ignored"));
test("scorer golden: returning someone else on a consent case is decoy confusion", () =>
  assert.equal(cat(entry("consent-422", null, "J"), ok("JON")).category, "decoy-confusion"));
test("scorer golden: errors", () => {
  assert.equal(cat(entry("match", "A"), { status: 500, error: "boom" }).category, "error");
  assert.equal(
    cat(entry("match", "A"), { status: 200, body: { resourceType: "Parameters", parameter: [] } })
      .category,
    "error",
  );
  assert.equal(
    cat(entry("no-match-422", null), { status: 422, body: { resourceType: "Patient" } }).category,
    "error",
  );
  assert.equal(cat(entry("match", "A"), { status: 404, body: {} }).category, "error");
  assert.equal(observe({ status: 0, error: "ECONNREFUSED" }).kind, "error");
});

test("scorer: tally counts every category and the total", () => {
  const rows = [
    cat(entry("match", "A"), ok("A")),
    cat(entry("match", "A"), ok("B")),
    cat(entry("consent-422", null, "J"), no("consent")),
  ];
  const sb = tally(rows, "d");
  assert.deepEqual(Object.keys(sb.matchers[0].counts), [...CATEGORIES]);
  assert.equal(sb.matchers[0].correct, 2);
  assert.equal(sb.matchers[0].total, 3);
});

// Integration: all rule-based matchers over all decoys via the HTTP endpoint, against the golden scoreboard.
const GOLDEN = "fixtures/golden/scoreboard.rule-based.json";
test("score: end-to-end scoreboard matches the golden file", async () => {
  const sb = await runScoreboard({ matchers: buildMatchers({}) });
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  assert.deepEqual(
    JSON.parse(JSON.stringify(sb)),
    golden,
    "behaviour changed: review, then npm run golden:update",
  );
});

test("score: refuses to run against a tampered ground truth", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-"));
  for (const p of ["manifest", "fixtures", "decoys"]) cpSync(p, join(dir, p), { recursive: true });
  const f = join(dir, "manifest/ground-truth.json");
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.entries.find((e: any) => e.case === "D4-card-mixup").outcome = "match";
  writeFileSync(f, JSON.stringify(j));
  await assert.rejects(runScoreboard({ matchers: buildMatchers({}), dir }), ManifestLockError);
});

test("score: refuses a request fixture that differs from the lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-"));
  for (const p of ["manifest", "fixtures", "decoys"]) cpSync(p, join(dir, p), { recursive: true });
  const f = join(dir, "fixtures/requests/D0-control.json");
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.parameter[0].resource.birthDate = "1951-09-10";
  writeFileSync(f, JSON.stringify(j));
  await assert.rejects(runScoreboard({ matchers: buildMatchers({}), dir }), ManifestLockError);
});
