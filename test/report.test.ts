import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadDecoys } from "../src/decoys.js";
import { runScoreboard } from "../src/run.js";
import { buildMatchers, MATCHER_INFO } from "../src/matchers/registry.js";
import { befriend, renderText, headline, nameIndex, explain } from "../src/report.js";
import { htmlReport } from "../src/report-html.js";
import { CATEGORIES, CATEGORY_INFO, tally, scoreOne } from "../src/scorer.js";

const set = loadDecoys();
const friendly = async () => befriend(await runScoreboard({ matchers: buildMatchers({}) }), set);

test("report: headline names the matcher that sent records to the wrong person", async () => {
  const f = await friendly();
  assert.equal(f.headline, "1 of 4 matchers sent someone's records to the wrong person: ID-first rules.");
});

test("report: headline when nobody was fooled", () => {
  const e = { case: "X", survivesIdMatch: false, outcome: "match", member: "p", memberIdentifier: "A", subjectMemberId: "A", requestSha256: "h" };
  const row = scoreOne("check-every-field", e, { status: 200, body: { resourceType: "Parameters", parameter: [{ name: "MemberIdentifier", valueIdentifier: { type: { coding: [{ code: "UMB" }] }, value: "A" } }] } });
  assert.equal(headline(tally([row], "d")), "None of the 1 matchers sent records to the wrong person.");
});

test("report: the wrong-person sentence uses the synthetic names", async () => {
  const f = await friendly();
  const r = f.rows.find((x) => x.matcher === "id-first" && x.case === "D4-card-mixup")!;
  assert.equal(r.explanation, "Sent Jon Roe's records in answer to a request for John Roe.");
  assert.equal(r.title, "John's demographics, Jon's card");
  assert.equal(r.rightAnswer, "Refuse (HRex 422): the card and the person don't agree.");
});

test("report: names include suffixes so Senior and Junior stay distinct", () => {
  const name = nameIndex(set);
  assert.equal(name("SYN-MEM-2001-01"), "Rowan Quill Sr");
  assert.equal(name("SYN-MEM-2001-02"), "Rowan Quill Jr");
});

test("report: every category has a plain label and meaning, and an explanation", () => {
  const name = nameIndex(set);
  for (const c of CATEGORIES) {
    assert.ok(CATEGORY_INFO[c].label && CATEGORY_INFO[c].meaning, c);
    const s = explain({ matcher: "m", case: "X", expected: "match", expectedMember: "SYN-MEM-1001-01", observed: c === "error" ? "error: HTTP 500" : "422 no-match", category: c, reasonMismatch: false, wrongPerson: "SYN-MEM-1002-01", subjectMemberId: "SYN-MEM-1001-01" }, name);
    assert.ok(s.length > 5 && !/undefined/.test(s), `${c}: ${s}`);
  }
});

test("report: text has no internal ids where a person reads it", async () => {
  const t = renderText(await friendly());
  for (const internal of ["c057", "baseline", "decoy-confusion", "multiple-422", "review-required"]) assert.ok(!t.includes(internal), `text contains ${internal}`);
  for (const m of MATCHER_INFO.filter((x) => !x.costsMoney)) assert.ok(t.includes(m.label), m.label);
});

test("report page: committed report/scoreboard.html matches a fresh build", async () => {
  const fresh = htmlReport(await friendly(), set);
  assert.equal(readFileSync("report/scoreboard.html", "utf8"), fresh, "run `npm run report` and commit");
});

test("report page: self-contained, banner present, no scripts", async () => {
  const html = htmlReport(await friendly(), set);
  assert.match(html, /<title>Member Match Decoy Lab<\/title>/);
  assert.match(html, /Synthetic data only/);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /Sent Jon Roe&#39;s records in answer to a request for John Roe/);
});

test("report: the summary lists only problems, in bullets", async () => {
  const { renderSummary } = await import("../src/report.js");
  const s = renderSummary(await friendly());
  assert.match(s, /^RESULT: 1 of 4 matchers/m);
  assert.equal((s.match(/^• /gm) ?? []).length, 4 + 2 + 1); // 4 scores, 2 problems, 1 "more"
  assert.match(s, /• ID-first rules, "John's demographics, Jon's card": Sent Jon Roe's records/);
});

test("report page: details are collapsed sections; summary first", async () => {
  const html = htmlReport(await friendly(), set);
  assert.ok(html.indexOf('id="h-scores"') < html.indexOf("<details"));
  assert.equal((html.match(/<details /g) ?? []).length, 4);
  assert.doesNotMatch(html, /<details[^>]* open/);
});
