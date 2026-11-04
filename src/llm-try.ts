/**
 * npm run llm:try [-- D4-card-mixup ...]   — run the LLM matcher live on some or all cases.
 * LLM_MODEL=claude-opus-5-5 npm run llm:try — the same on a stronger model.
 * Refuses to start unless the SMS spend alert is configured. Prints each decision and its cost.
 * The full scoreboard is task 8 (npm run score).
 */
import { readFileSync } from "node:fs";
import { loadDecoys } from "./decoys.js";
import { roster } from "./population.js";
import { handle } from "./server.js";
import { llmMatcher, DEFAULT_LLM_MODEL } from "./matchers/llm/index.js";
import { SpendGuard } from "./spend.js";
import { twilioSender, missingAlertEnv } from "./alert.js";
import { SYNTHETIC_BANNER } from "./index.js";

const missing = missingAlertEnv();
if (missing.length) {
  console.error(`Refusing to spend: the SMS spend alert is not configured (set ${missing.join(", ")}).`);
  process.exit(2);
}
const set = loadDecoys();
const wanted = process.argv.slice(2);
const cases = set.cases.filter((c) => wanted.length === 0 || wanted.includes(c.id));
const spend = new SpendGuard({ alert: twilioSender() });
const m = llmMatcher({ spend });
const opts = { matchers: [m], roster: roster(set), consent: { asOf: set.asOf, canSegmentSensitive: set.targetPayer.canSegmentSensitive } };

console.log(`${SYNTHETIC_BANNER}\nmodel: ${process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL}`);
for (const c of cases) {
  const before = spend.status().spentUsd;
  try {
    const r: any = await handle(opts, "llm", JSON.parse(readFileSync(`fixtures/requests/${c.id}.json`, "utf8")));
    const what = r.status === 200 ? r.body.parameter[0].valueIdentifier.value : r.body.issue[0].details.coding[0].code;
    console.log(`${c.id.padEnd(26)} ${r.status} ${String(what).padEnd(17)} $${(spend.status().spentUsd - before).toFixed(4)}  ${r.log.rationale}`);
  } catch (e) {
    console.log(`${c.id.padEnd(26)} ERROR ${(e as Error).message}`);
    if ((e as Error).name === "SpendCeilingError") break;
  }
}
const s = spend.status();
console.log(`\nspend ${s.month}: $${s.spentUsd.toFixed(4)} of $${s.ceilingUsd}`);
