/**
 * npm run score                      — rule-based matchers (free, offline)
 * npm run score -- --llm             — plus the LLM matcher (HRex rules in its prompt)
 * npm run score -- --llm-norules     — plus the LLM matcher without the rule text
 * npm run score -- --json            — machine-readable scoreboard on stdout
 * npm run score -- D4-card-mixup ... — only these cases
 * Env: C057_AUTO_CONFIRM (c057-tuned), LLM_MODEL (default claude-sonnet-5-5).
 * Writes .runs/scoreboard.json. Exit 0 whatever the scores; exit 2 if the lock or the spend guard stops the run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildMatchers } from "./matchers/registry.js";
import { runScoreboard } from "./run.js";
import { render } from "./scorer.js";
import { missingAlertEnv } from "./alert.js";
import { SYNTHETIC_BANNER } from "./index.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const cases = args.filter((a) => !a.startsWith("--"));
const llm = flags.has("--llm"), llmNoRules = flags.has("--llm-norules");

if ((llm || llmNoRules) && missingAlertEnv().length) {
  console.error(`Refusing to spend: the SMS spend alert is not configured (set ${missingAlertEnv().join(", ")}).`);
  process.exit(2);
}

try {
  const sb = await runScoreboard({ matchers: buildMatchers(process.env, { llm, llmNoRules }), cases });
  mkdirSync(".runs", { recursive: true });
  writeFileSync(".runs/scoreboard.json", JSON.stringify(sb, null, 2) + "\n");
  if (flags.has("--json")) console.log(JSON.stringify(sb, null, 2));
  else console.log(`${SYNTHETIC_BANNER}\n\n${render(sb)}`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(2);
}
