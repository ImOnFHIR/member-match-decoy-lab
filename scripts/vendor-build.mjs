// npm run vendor:build — the hash-pinned bundle other sites embed (imonfhir.com's workbench page).
// Output: dist/vendor/member-match-decoy-lab/
//   core.js          one ESM file, browser-safe (esbuild platform "neutral": any Node import fails the build)
//   data.json        decoys + locked answer key + the 6 requests + lock digest (verified here, in Node)
//   tool.json        name, title, about, presets, inputSchema (from the real MCP server listing)
//   views/*.json     sample ToolViews every renderer must show (the conformance set)
//   runs/*.json      recorded AI runs, scored and dated, with cost
//   LICENSE, NOTICE, PROVENANCE.json (lab commit, sha256 of every file)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadCoreData } from "../dist/src/core/data-node.js";
import { scoreDecoys } from "../dist/src/core/index.js";
import { CONFORMANCE_RUNS } from "../dist/src/core/conformance.js";

const OUT = "dist/vendor/member-match-decoy-lab";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "views"), { recursive: true });

// 1. Data, verified against the lock.
const data = loadCoreData(".");
writeFileSync(join(OUT, "data.json"), JSON.stringify(data) + "\n");

// 2. Core, bundled for the browser.
await build({
  entryPoints: ["src/core/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  outfile: join(OUT, "core.js"),
  legalComments: "inline",
  logLevel: "error",
  banner: {
    js: "// member-match-decoy-lab core (Apache-2.0). Synthetic data only; not a production matching recommendation.",
  },
});

// 3. Tool description, presets and inputSchema from the real server.
const client = new Client({ name: "vendor-build", version: "0" });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: [resolve("dist/mcp.js")] }),
);
const { tools } = await client.listTools();
await client.close();
const t = tools.find((x) => x.name === "score_member_match");
writeFileSync(
  join(OUT, "tool.json"),
  JSON.stringify(
    {
      name: t.name,
      title: t.title,
      about: t._meta["com.imonfhir/about"],
      presets: t._meta["com.imonfhir/presets"],
      cost: t._meta["com.imonfhir/cost"],
      form: t._meta["com.imonfhir/form"],
      inputSchema: t.inputSchema,
    },
    null,
    2,
  ) + "\n",
);

// 4. Conformance views (also committed under test/views/ for this repo's own drift test).
for (const run of CONFORMANCE_RUNS) {
  const { view } = await scoreDecoys(data, run.options);
  writeFileSync(join(OUT, "views", `${run.id}.json`), JSON.stringify(view, null, 2) + "\n");
}

// 5. Recorded AI runs (scored, dated, with cost): sites show these instead of calling any AI.
mkdirSync(join(OUT, "runs"), { recursive: true });
for (const f of readdirSync("fixtures/runs").filter((f) => f.endsWith(".json")))
  copyFileSync(join("fixtures/runs", f), join(OUT, "runs", f));

// 6. Licence, notice, provenance.
copyFileSync("LICENSE", join(OUT, "LICENSE"));
writeFileSync(
  join(OUT, "NOTICE"),
  "member-match-decoy-lab\nCopyright 2026 ImOnFHIR. Licensed under the Apache License, Version 2.0.\nhttps://github.com/ImOnFHIR/member-match-decoy-lab\nSynthetic data only; not a production matching recommendation.\n",
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
const files = {};
const walk = (d, pre = "") => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name),
      rel = pre + e.name;
    if (e.isDirectory()) walk(p, rel + "/");
    else files[rel] = createHash("sha256").update(readFileSync(p)).digest("hex");
  }
};
walk(OUT);
writeFileSync(
  join(OUT, "PROVENANCE.json"),
  JSON.stringify(
    {
      source: "https://github.com/ImOnFHIR/member-match-decoy-lab",
      commit,
      dirty,
      lockDigest: data.lockDigest,
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `vendor bundle: ${OUT} (${Object.keys(files).length} files, commit ${commit.slice(0, 7)}${dirty ? " + uncommitted changes" : ""})`,
);
