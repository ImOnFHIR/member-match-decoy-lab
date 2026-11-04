/**
 * npm run report — writes report/scoreboard.html from a fresh run of the four rule-based matchers.
 * npm run report -- --fragment <path> — the same page without <html>/<head>/<body>, for hosts that add their own.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildMatchers } from "./matchers/registry.js";
import { runScoreboard } from "./run.js";
import { befriend } from "./report.js";
import { htmlReport } from "./report-html.js";
import { loadDecoys } from "./decoys.js";

export const REPORT_PATH = "report/scoreboard.html";

const set = loadDecoys();
const sb = befriend(await runScoreboard({ matchers: buildMatchers({}) }), set);
const i = process.argv.indexOf("--fragment");
const out = i > 0 ? process.argv[i + 1] : REPORT_PATH;
if (!out) { console.error("--fragment needs an output path"); process.exit(2); }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, htmlReport(sb, set, { fragment: i > 0 }));
console.log(`wrote ${out}`);
