/**
 * npm run score                      — the four rule-based matchers (free, offline)
 * npm run score -- --ai              — plus the AI adjudicator, given the HRex rules (costs a few cents)
 * npm run score -- --ai-no-rules     — plus the AI adjudicator, given no rules
 * npm run score -- --json            — the scoreboard as JSON
 * npm run score -- D4-card-mixup ... — only these decoys
 * Settings: RELAXED_CONFIDENCE=85 (75–100), LLM_MODEL=claude-sonnet-5-5.
 * Writes .runs/scoreboard.json. Exit 2 if the answer-key lock or the spend guard stops the run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildMatchers } from "./matchers/registry.js";
import { runScoreboard } from "./run.js";
import { befriend, renderText } from "./report.js";
import { loadDecoys } from "./decoys.js";
import { missingAlertEnv } from "./alert.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const cases = args.filter((a) => !a.startsWith("--"));
const ai = flags.has("--ai"), aiNoRules = flags.has("--ai-no-rules");

if ((ai || aiNoRules) && missingAlertEnv().length) {
  console.error(`Refusing to spend: the SMS spend alert is not configured (set ${missingAlertEnv().join(", ")}).`);
  process.exit(2);
}

try {
  const sb = befriend(await runScoreboard({ matchers: buildMatchers(process.env, { ai, aiNoRules }), cases }), loadDecoys());
  mkdirSync(".runs", { recursive: true });
  writeFileSync(".runs/scoreboard.json", JSON.stringify(sb, null, 2) + "\n");
  console.log(flags.has("--json") ? JSON.stringify(sb, null, 2) : renderText(sb));
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(2);
}
