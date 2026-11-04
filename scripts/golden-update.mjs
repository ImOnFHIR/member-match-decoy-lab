// npm run golden:update — rewrite the rule-based golden scoreboard after a deliberate behaviour change.
// Review the diff before committing: a changed golden file is a changed result.
import { writeFileSync } from "node:fs";
import { runScoreboard } from "../dist/src/run.js";
import { buildMatchers } from "../dist/src/matchers/registry.js";

const sb = await runScoreboard({ matchers: buildMatchers({}) });
writeFileSync("fixtures/golden/scoreboard.rule-based.json", JSON.stringify(sb, null, 2) + "\n");
console.log("golden updated: fixtures/golden/scoreboard.rule-based.json — review the diff");
