import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";
import { build } from "esbuild";
import { scoreDecoys } from "../src/core/index.js";
import { loadCoreData } from "../src/core/data-node.js";
import { CONFORMANCE_RUNS } from "../src/core/conformance.js";
import { runScoreboard } from "../src/run.js";
import { buildMatchers } from "../src/matchers/registry.js";
import { checkView } from "mcp-tool-console";

const data = loadCoreData(".");
const strip = (rows: any[]) =>
  rows.map(({ matcher, case: c, category, observed, reasonMismatch, wrongPerson }) => ({
    matcher,
    c,
    category,
    observed,
    reasonMismatch,
    wrongPerson,
  }));

test("core parity: in-memory scoring equals the MCP/HTTP path at every confidence 75–100", async () => {
  for (let pct = 75; pct <= 100; pct++) {
    const viaHttp = await runScoreboard({
      matchers: buildMatchers({ RELAXED_CONFIDENCE: String(pct) }),
    });
    const inMem = await scoreDecoys(data, { relaxedConfidence: pct });
    assert.deepEqual(strip(inMem.scoreboard.rows), strip(viaHttp.rows), `confidence ${pct}`);
    assert.equal(inMem.scoreboard.manifestDigest, viaHttp.manifestDigest);
  }
});

test("core: options narrow the run; unknown ids are refused", async () => {
  const r = await scoreDecoys(data, { matchers: ["id-first"], cases: ["D4-card-mixup"] });
  assert.equal(r.scoreboard.rows.length, 1);
  assert.equal(r.scoreboard.rows[0].category, "decoy-confusion");
  await assert.rejects(scoreDecoys(data, { matchers: ["ai-with-rules"] }), /unknown matcher/);
  await assert.rejects(scoreDecoys(data, { cases: ["D9"] }), /unknown case/);
  await assert.rejects(scoreDecoys(data, { relaxedConfidence: 50 }), /75 to 100/);
});

test("core purity: the bundle runs in a bare JS sandbox (no Node, no network)", async () => {
  const out = await build({
    entryPoints: ["src/core/index.ts"],
    bundle: true,
    format: "iife",
    globalName: "Core",
    platform: "neutral",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  const code = out.outputFiles[0].text;
  for (const banned of [
    /\bnode:/,
    /\brequire\(/,
    /process\.env/,
    /\bfetch\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /sendBeacon/,
    /new Function/,
    /\beval\(/,
    /\bimport\(/,
  ])
    assert.doesNotMatch(code, banned, `bundle contains ${banned}`);
  // Only what every browser provides; no require, process, fetch or fs.
  const sandbox: Record<string, unknown> = { structuredClone, TextEncoder };
  vm.runInNewContext(`${code}\nthis.Core = Core;`, sandbox);
  const r = await (sandbox.Core as any).scoreDecoys(JSON.parse(JSON.stringify(data)));
  assert.match(r.view.headline, /^1 of 4 matchers/);
  assert.match(r.summary, /^RESULT: /m);
});

// Conformance views: committed, and every renderer is tested against them.
test("conformance views: test/views/*.json match a fresh run and are valid", async () => {
  mkdirSync("test/views", { recursive: true });
  for (const run of CONFORMANCE_RUNS) {
    const { view } = await scoreDecoys(data, run.options);
    assert.deepEqual(checkView(view), [], run.id);
    const path = `test/views/${run.id}.json`;
    const fresh = JSON.stringify(view, null, 2) + "\n";
    if (process.env.UPDATE_VIEWS) writeFileSync(path, fresh);
    assert.equal(
      readFileSync(path, "utf8"),
      fresh,
      `${path} is stale: UPDATE_VIEWS=1 npm test -- core`,
    );
  }
});
