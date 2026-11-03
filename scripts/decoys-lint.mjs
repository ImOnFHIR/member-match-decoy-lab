// decoys:lint — every case has a trap and an expected outcome that the data can support.
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "decoys/decoys.json";
const md = process.argv[3] ?? "DECOYS.md";
const d = JSON.parse(readFileSync(file, "utf8"));
const doc = readFileSync(md, "utf8");
const people = new Set(d.people.map((p) => p.id));
const covs = new Map(d.coverages.map((c) => [c.id, c]));
const errors = [];
const err = (id, m) => errors.push(`${id}: ${m}`);

for (const c of d.coverages) if (!people.has(c.beneficiary)) err(c.id, `unknown beneficiary ${c.beneficiary}`);

const ids = new Set();
for (const c of d.cases) {
  if (ids.has(c.id)) err(c.id, "duplicate id");
  ids.add(c.id);
  if (!c.trap?.trim()) err(c.id, "missing trap");
  if (typeof c.survivesIdMatch !== "boolean") err(c.id, "survivesIdMatch must be true/false");
  if (!people.has(c.request?.patient)) err(c.id, `unknown request.patient ${c.request?.patient}`);
  if (!c.request?.card?.subscriberId && !c.request?.card?.memberId)
    err(c.id, "card needs subscriberId or memberId (HRex deterministic minimum)");
  if (!["valid", "expired", "none"].includes(c.request?.consent)) err(c.id, "consent must be valid|expired|none");
  const o = c.expected?.outcome;
  if (!d.outcomes.includes(o)) err(c.id, `expected.outcome must be one of ${d.outcomes.join("|")}`);
  if (o === "match") {
    if (!people.has(c.expected.member)) err(c.id, "match needs expected.member");
    const cov = [...covs.values()].find((v) => v.memberId === c.expected.memberIdentifier);
    if (!cov) err(c.id, "expected.memberIdentifier is not any coverage's memberId");
    else if (cov.beneficiary !== c.expected.member) err(c.id, "memberIdentifier belongs to someone else");
  } else if (c.expected?.member) err(c.id, `${o} must not name a member`);
  if (!doc.includes(c.id)) err(c.id, `not documented in ${md}`);
}

const outcomes = new Set(d.cases.map((c) => c.expected?.outcome));
for (const o of d.outcomes) if (!outcomes.has(o)) errors.push(`set: no case expects ${o}`);
if (!d.cases.some((c) => c.survivesIdMatch)) errors.push("set: no case survives an ID match (brief criterion 2)");

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${d.cases.length} cases, ${d.cases.filter((c) => c.survivesIdMatch).length} survive an ID match, all ${d.outcomes.length} outcomes covered`);
