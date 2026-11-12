// The tool package (src/package-build.ts): the committed half is exactly what a fresh build makes,
// recorded runs convert to the package's shape, and the browser half's PROVENANCE holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPackage, readRuns } from "mcp-tool-console/package";
import { loadConsoleConfig } from "mcp-tool-console/console";
import { loadCoreData } from "../src/core/data-node.js";
import {
  PACKAGE_DIR,
  RUNS_SOURCE,
  SERVER_ID,
  TOOL,
  buildBrowser,
  toPackageRun,
  writePackageRuns,
} from "../src/package-build.js";

const data = loadCoreData(".");
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `decoy-${p}-`));
const walk = (dir: string, pre = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${pre}${e.name}/`) : [pre + e.name],
  );
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const source = JSON.parse(readFileSync(join(RUNS_SOURCE, "ai-2026-11-04.json"), "utf8"));

test("package runs: the 2026-11-04 AI run converts to the package's recorded-run shape", () => {
  const dir = tmp("runs");
  assert.deepEqual(writePackageRuns(dir), ["ai-2026-11-04.json"]);
  // The console's own reader: exact keys, v 1, non-empty strings, a number cost, a valid ToolView.
  assert.equal(readRuns(dir).length, 1);
  const r = JSON.parse(readFileSync(join(dir, "ai-2026-11-04.json"), "utf8"));
  assert.equal(r.tool, TOOL);
  assert.equal(r.recorded, "2026-11-04");
  assert.equal(r.model, "claude-sonnet-5-5");
  assert.equal(r.lockDigest, data.lockDigest);
  assert.deepEqual(r.args, { matchers: ["ai-with-rules", "ai-with-definitions", "ai-no-rules"] });
  assert.deepEqual(r.structuredContent, source.scoreboard);
  assert.deepEqual(r.view, source.view);
  assert.equal(r.costUsd, 0.228); // 0.0762 + 0.0806 + 0.0712
});

test("package runs: a run scored against another lock, or with no model or cost, is refused", () => {
  const other = { ...source, scoreboard: { ...source.scoreboard, manifestDigest: "0".repeat(64) } };
  assert.throws(() => toPackageRun(other, data.lockDigest), /scored against lock 0{64}/);
  assert.throws(() => toPackageRun({ ...source, models: [] }, data.lockDigest), /names no model/);
  assert.throws(() => toPackageRun({ ...source, costUsd: {} }, data.lockDigest), /no usable cost/);
});

test("package: the committed package/decoy-lab is exactly a fresh build", async () => {
  const runsDir = tmp("pkg-runs");
  writePackageRuns(runsDir);
  const config = loadConsoleConfig(".").find((s) => s.id === SERVER_ID);
  assert.ok(config, `console.config.json has a ${SERVER_ID} server`);
  const built = await buildPackage(config, { runs: readRuns(runsDir) });
  assert.deepEqual(
    walk(PACKAGE_DIR).toSorted(),
    [...built.files.keys()].toSorted(),
    "the committed file set differs from a fresh build: npm run package",
  );
  for (const [path, text] of built.files)
    assert.equal(
      readFileSync(join(PACKAGE_DIR, path), "utf8"),
      text,
      `${PACKAGE_DIR}/${path} is stale: commit your change, then npm run package`,
    );
  // The recorded run rides in the package; the free presets were actually run.
  assert.ok(built.files.has(`runs/${TOOL}/ai-2026-11-04.json`));
  assert.ok(built.called.length > 0, "no preset ran");
});

test("browser half: every file matches its PROVENANCE, which names the committed package", async () => {
  const dir = tmp("browser");
  const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, "PROVENANCE.json"), "utf8"));
  await buildBrowser(dir, { commit: "test", dirty: true, packageDigest: pkg.packageDigest });
  const prov = JSON.parse(readFileSync(join(dir, "PROVENANCE.json"), "utf8"));
  const seen = walk(dir).filter((f) => f !== "PROVENANCE.json");
  assert.deepEqual(seen.toSorted(), ["LICENSE", "NOTICE", "core.js", "data.json"]);
  assert.deepEqual(Object.keys(prov.files).toSorted(), seen.toSorted());
  for (const f of seen) assert.equal(sha256(readFileSync(join(dir, f))), prov.files[f], f);
  assert.equal(prov.packageDigest, pkg.packageDigest);
  assert.match(prov.packageDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    prov.lockDigest,
    readFileSync("manifest/ground-truth.sha256", "utf8").split(/\s+/)[0],
  );
});
