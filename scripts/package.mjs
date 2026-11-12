// npm run package — the tool package other sites pin (src/package-build.ts has the layout).
//   1. Recorded AI runs (fixtures/runs/) converted to the package's run shape, in dist/package-runs/.
//   2. mcp-tool-console's `package` command writes package/decoy-lab/ (commit it). It refuses an
//      uncommitted change to a tracked file and then writes nothing: commit first, then package.
//   3. The browser half: dist/package/decoy-lab/browser/ (core.js, data.json, LICENSE, NOTICE,
//      PROVENANCE.json naming the package's digest). A build output; never committed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runPackageCommand } from "mcp-tool-console/package";
import {
  BROWSER_DIR,
  PACKAGE_DIR,
  SERVER_ID,
  buildBrowser,
  writePackageRuns,
} from "../dist/src/package-build.js";

const runsDir = join("dist", "package-runs");
const runs = writePackageRuns(runsDir);

const code = await runPackageCommand(
  ["--server", SERVER_ID, "--out", PACKAGE_DIR, "--runs", runsDir],
  process.cwd(),
);
if (code !== 0) process.exit(code);

// The command has just refused a dirty tree, so the commit below is what was packaged.
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const { packageDigest } = JSON.parse(readFileSync(join(PACKAGE_DIR, "PROVENANCE.json"), "utf8"));
const files = await buildBrowser(BROWSER_DIR, { commit, dirty: false, packageDigest });
console.log(
  `package: ${PACKAGE_DIR} (${packageDigest}, ${runs.length} recorded run(s)); browser: ${BROWSER_DIR} (${Object.keys(files).length} files, commit ${commit.slice(0, 7)})`,
);
