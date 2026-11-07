// node scripts/record-ai-run.mjs <decisions.jsonl> <date YYYY-MM-DD> > fixtures/runs/ai-<date>.json
// Turns logged AI decisions into a recorded, scored run that sites can show without calling any AI.
// Each decision is mapped to the HTTP answer the endpoint returned (match → 200 + member id;
// refusal → 422 + reason) and scored against the locked answer key, as the live run was.
import { readFileSync, readdirSync } from "node:fs";
import { loadCoreData } from "../dist/src/core/data-node.js";
import { scoreOne, tally } from "../dist/src/scorer.js";
import { befriend } from "../dist/src/report.js";
import { toView } from "../dist/src/report-view.js";
import { matchResponse, refusal } from "../dist/src/fhir.js";
import { MATCHER_INFO } from "../dist/src/matchers/info.js";

const [file, date] = process.argv.slice(2);
if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
  console.error("usage: record-ai-run.mjs <decisions.jsonl> <YYYY-MM-DD>");
  process.exit(2);
}
const data = loadCoreData(".");
const caseByRequestId = Object.fromEntries(
  readdirSync("fixtures/requests").map((f) => [
    JSON.parse(readFileSync(`fixtures/requests/${f}`, "utf8")).id,
    f.replace(/\.json$/, ""),
  ]),
);
const decisions = readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l))
  .filter((d) => d.at.startsWith(date));

// Keep the last decision per matcher × case (a rerun replaces an earlier one).
const last = new Map();
for (const d of decisions) last.set(`${d.matcher}|${caseByRequestId[d.request]}`, d);

const rows = [],
  cost = {},
  models = new Set(),
  servedBy = new Set();
for (const d of last.values()) {
  const c = caseByRequestId[d.request];
  const e = data.manifest.entries.find((x) => x.case === c);
  if (!e) throw new Error(`unknown request ${d.request}`);
  const dec = d.decision;
  const answer = !dec
    ? { status: 500, error: "no parseable decision" }
    : dec.decision === "match"
      ? { status: 200, body: matchResponse(dec.memberId) }
      : { status: 422, body: refusal(dec.decision, dec.rationale) };
  rows.push(scoreOne(d.matcher, e, answer));
  cost[d.matcher] = (cost[d.matcher] ?? 0) + d.usd;
  models.add(d.model);
  servedBy.add(d.servedBy);
}
const order = (m) => MATCHER_INFO.findIndex((i) => i.id === m);
rows.sort((a, b) => order(a.matcher) - order(b.matcher) || a.case.localeCompare(b.case));
const scoreboard = befriend(tally(rows, data.lockDigest), data.decoys);
const rationales = [...last.values()].map((d) => ({
  matcher: d.matcher,
  case: caseByRequestId[d.request],
  decision: d.decision?.decision,
  rationale: d.decision?.rationale,
}));
console.log(
  JSON.stringify(
    {
      recorded: date,
      models: [...models],
      servedBy: [...servedBy],
      runsPerMatcher: 1,
      costUsd: Object.fromEntries(
        Object.entries(cost).map(([k, v]) => [k, Math.round(v * 10000) / 10000]),
      ),
      note: "One run per AI version. Synthetic data only; not a production matching recommendation.",
      scoreboard,
      view: toView(scoreboard),
      rationales,
    },
    null,
    2,
  ),
);
