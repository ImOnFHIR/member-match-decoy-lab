// npm run package — the tool package other sites pin (src/package-build.ts has the layout).
//   1. The browser half (core.js, data.json, LICENSE, NOTICE) into dist/package/decoy-lab/browser/.
//      If core.js or data.json now hash differently from manifest/browser.sha256.json, the new hashes
//      are written there and this stops: commit that file, then package again. The server advertises
//      it in the tool's `_meta`, so the package (and its packageDigest) covers the browser code.
//   2. Recorded AI runs (fixtures/runs/) converted to the package's run shape, in dist/package-runs/.
//   3. mcp-tool-console's `package` command writes package/decoy-lab/ (commit it). It refuses an
//      uncommitted change to a tracked file and then writes nothing: commit first, then package.
//   4. The browser half's PROVENANCE.json, naming the package's digest. A build output, never committed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPackageCommand } from "mcp-tool-console/package";
import {
  BROWSER_DIGEST,
  BROWSER_DIR,
  PACKAGE_DIR,
  SERVER_ID,
  browserDigestText,
  buildBrowserFiles,
  writeBrowserProvenance,
  writePackageRuns,
} from "../dist/src/package-build.js";

const files = await buildBrowserFiles(BROWSER_DIR);
const pinned = browserDigestText(files);
if (!existsSync(BROWSER_DIGEST) || readFileSync(BROWSER_DIGEST, "utf8") !== pinned) {
  writeFileSync(BROWSER_DIGEST, pinned);
  console.error(
    `package: the browser code changed, so ${BROWSER_DIGEST} now holds its new sha256. Commit it, then run npm run package again.`,
  );
  process.exit(1);
}

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
writeBrowserProvenance(BROWSER_DIR, files, { commit, dirty: false, packageDigest });
console.log(
  `package: ${PACKAGE_DIR} (${packageDigest}, ${runs.length} recorded run(s)); browser: ${BROWSER_DIR} (${Object.keys(files).length} files, commit ${commit.slice(0, 7)})`,
);
