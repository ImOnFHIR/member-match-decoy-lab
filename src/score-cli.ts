/**
 * npm run score                      — the four rule-based matchers (free, offline)
 * npm run score -- --ai              — plus the AI adjudicator, given the HRex rules (costs a few cents)
 * npm run score -- --ai-no-rules     — plus the AI adjudicator, given no rules
 * npm run score -- --ai-definitions  — plus the AI adjudicator, given the rules and HRex's consent-code definitions
 * npm run score -- --full            — every answer, explained (default is the short summary)
 * npm run score -- --json            — the scoreboard as JSON
 * npm run score -- D4-card-mixup ... — only these decoys
 * Settings: RELAXED_CONFIDENCE=85 (75–100), LLM_MODEL=claude-sonnet-5-5.
 * Writes .runs/scoreboard.json. Exit 2 if the answer-key lock or the spend guard stops the run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildMatchers } from "./matchers/registry.js";
import { runScoreboard } from "./run.js";
import { befriend, renderText, renderSummary } from "./report.js";
import { loadDecoys } from "./decoys.js";
import { missingAlertEnv } from "./alert.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const cases = args.filter((a) => !a.startsWith("--"));
const ai = flags.has("--ai"), aiNoRules = flags.has("--ai-no-rules"), aiDefinitions = flags.has("--ai-definitions");

if ((ai || aiNoRules || aiDefinitions) && missingAlertEnv().length) {
  console.error(`Refusing to spend: the SMS spend alert is not configured (set ${missingAlertEnv().join(", ")}).`);
  process.exit(2);
}

try {
  const sb = befriend(await runScoreboard({ matchers: buildMatchers(process.env, { ai, aiNoRules, aiDefinitions }), cases }), loadDecoys());
  mkdirSync(".runs", { recursive: true });
  writeFileSync(".runs/scoreboard.json", JSON.stringify(sb, null, 2) + "\n");
  console.log(flags.has("--json") ? JSON.stringify(sb, null, 2) : flags.has("--full") ? renderText(sb) : renderSummary(sb, "For every answer explained: npm run score -- --full"));
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(2);
}
