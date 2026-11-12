// npm run package — the tool package other sites pin (src/package-build.ts has the layout).
//   0. Refuse an uncommitted change to a tracked file before touching anything (the same check the
//      console's `package` command makes): a refused run leaves every earlier output as it was.
//   1. The browser half (core.js, data.json, LICENSE, NOTICE) is built into a staging folder. If
//      core.js or data.json now hash differently from manifest/browser.sha256.json, the new hashes
//      are written there and this stops: commit that file, then package again. The server advertises
//      it in the tool's `_meta`, so the package (and its packageDigest) covers the browser code.
//   2. Recorded AI runs (fixtures/runs/) converted to the package's run shape, in dist/package-runs/.
//   3. mcp-tool-console's `package` command writes package/decoy-lab/ (commit it).
//   4. The browser half gets its PROVENANCE.json (naming the package's digest) and only then
//      replaces dist/package/decoy-lab/browser/. A build output, never committed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirtyAcross, runPackageCommand } from "mcp-tool-console/package";
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

const dirty = dirtyAcross([process.cwd()]);
if (dirty.length) {
  console.error(
    `package: uncommitted changes to tracked files; commit or stash them first. Nothing was written.\n${dirty.map((l) => `  ${l}`).join("\n")}`,
  );
  process.exit(1);
}

const staging = `${BROWSER_DIR}.staging`;
const files = await buildBrowserFiles(staging);
const pinned = browserDigestText(files);
if (!existsSync(BROWSER_DIGEST) || readFileSync(BROWSER_DIGEST, "utf8") !== pinned) {
  writeFileSync(BROWSER_DIGEST, pinned);
  rmSync(staging, { recursive: true, force: true });
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
if (code !== 0) {
  rmSync(staging, { recursive: true, force: true });
  process.exit(code);
}

// The tree was clean at the start and the command checked it again, so this commit is what was packaged.
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const { packageDigest } = JSON.parse(readFileSync(join(PACKAGE_DIR, "PROVENANCE.json"), "utf8"));
writeBrowserProvenance(staging, files, { commit, dirty: false, packageDigest });
rmSync(BROWSER_DIR, { recursive: true, force: true });
renameSync(staging, BROWSER_DIR);
console.log(
  `package: ${PACKAGE_DIR} (${packageDigest}, ${runs.length} recorded run(s)); browser: ${BROWSER_DIR} (${Object.keys(files).length} files, commit ${commit.slice(0, 7)})`,
);
