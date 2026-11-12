// The tool package other sites pin, in two halves (`npm run package`, scripts/package.mjs):
//
//   package/decoy-lab/               COMMITTED. Written by mcp-tool-console's `package` command:
//                                    package.json, tools/*.json, views/**, runs/**, PROVENANCE.json
//                                    (sha256 of every file, and packageDigest). test/package.test.ts
//                                    rebuilds it and fails on any difference.
//   dist/package/decoy-lab/browser/  BUILT. core.js (the scorer, browser-safe), data.json (decoys,
//                                    locked answer key, the 6 requests), LICENSE, NOTICE and a
//                                    PROVENANCE.json that names the committed package's digest.
//
// Node only. Recorded AI runs stay in fixtures/runs/ as scripts/record-ai-run.mjs writes them; this
// module converts them to the package's recorded-run shape on the way in.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { canonical } from "mcp-tool-console/package";
import { loadCoreData } from "./core/data-node.js";

export const SERVER_ID = "decoy-lab";
export const TOOL = "score_member_match";
export const PACKAGE_DIR = join("package", SERVER_ID);
export const BROWSER_DIR = join("dist", "package", SERVER_ID, "browser");
export const RUNS_SOURCE = join("fixtures", "runs");

/** A recorded AI run as scripts/record-ai-run.mjs writes it (fixtures/runs/ai-<date>.json). */
interface RecordedAiRun {
  recorded: string;
  models: string[];
  costUsd: Record<string, number>;
  scoreboard: { manifestDigest: string; matchers: { matcher: string }[] };
  view: unknown;
}

/** The package's recorded-run shape: exactly these keys (mcp-tool-console `readRuns`). */
export interface PackageRun {
  v: 1;
  recorded: string;
  tool: string;
  args: { matchers: string[] };
  structuredContent: unknown;
  view: unknown;
  model: string;
  costUsd: number;
  lockDigest: string;
}

/**
 * One recorded AI run in the package's shape. `structuredContent` is the scoreboard the tool itself
 * returns; `args` names the AI matchers that ran (they are costed, so the free tool refuses them:
 * that is why the run is recorded); `costUsd` is the per-matcher costs added up. A run scored
 * against any lock but the current one is refused, because its answers would no longer be checked
 * against the key it claims.
 */
export function toPackageRun(run: RecordedAiRun, lockDigest: string): PackageRun {
  const where = `recorded run ${run.recorded}`;
  if (run.scoreboard?.manifestDigest !== lockDigest)
    throw new Error(
      `${where} was scored against lock ${run.scoreboard?.manifestDigest}, not the current ${lockDigest}`,
    );
  if (!Array.isArray(run.models) || run.models.length === 0)
    throw new Error(`${where} names no model`);
  const costs = Object.values(run.costUsd ?? {});
  if (costs.length === 0 || costs.some((c) => typeof c !== "number" || !(c >= 0)))
    throw new Error(`${where} has no usable cost`);
  return {
    v: 1,
    recorded: run.recorded,
    tool: TOOL,
    args: { matchers: run.scoreboard.matchers.map((m) => m.matcher) },
    structuredContent: run.scoreboard,
    view: run.view,
    model: run.models.join(", "),
    costUsd: Math.round(costs.reduce((a, b) => a + b, 0) * 1e4) / 1e4,
    lockDigest,
  };
}

/** Converts every recorded run into `outDir` (replaced), one canonical JSON file each. */
export function writePackageRuns(outDir: string, root = "."): string[] {
  const { lockDigest } = loadCoreData(root);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const names = readdirSync(join(root, RUNS_SOURCE))
    .filter((f) => f.endsWith(".json"))
    .toSorted();
  for (const f of names) {
    const run = JSON.parse(readFileSync(join(root, RUNS_SOURCE, f), "utf8")) as RecordedAiRun;
    writeFileSync(join(outDir, f), canonical(toPackageRun(run, lockDigest)));
  }
  return names;
}

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

export const NOTICE =
  "member-match-decoy-lab\nCopyright 2026 ImOnFHIR. Licensed under the Apache License, Version 2.0.\nhttps://github.com/ImOnFHIR/member-match-decoy-lab\nSynthetic data only; not a production matching recommendation.\n";

/**
 * The browser half, into `outDir` (replaced). Its PROVENANCE.json records each file's sha256, the
 * lock digest, the commit and whether the tree was dirty, and the committed package's digest, so a
 * consumer can check the two halves belong together.
 */
export async function buildBrowser(
  outDir: string,
  meta: { commit: string; dirty: boolean; packageDigest: string },
): Promise<Record<string, string>> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const data = loadCoreData(".");
  writeFileSync(join(outDir, "data.json"), JSON.stringify(data) + "\n");
  await build({
    entryPoints: ["src/core/index.ts"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile: join(outDir, "core.js"),
    legalComments: "inline",
    logLevel: "error",
    banner: {
      js: "// member-match-decoy-lab core (Apache-2.0). Synthetic data only; not a production matching recommendation.",
    },
  });
  copyFileSync("LICENSE", join(outDir, "LICENSE"));
  writeFileSync(join(outDir, "NOTICE"), NOTICE);
  const files = Object.fromEntries(
    readdirSync(outDir)
      .toSorted()
      .map((f) => [f, sha256(readFileSync(join(outDir, f)))]),
  );
  writeFileSync(
    join(outDir, "PROVENANCE.json"),
    canonical({
      source: "https://github.com/ImOnFHIR/member-match-decoy-lab",
      commit: meta.commit,
      dirty: meta.dirty,
      lockDigest: data.lockDigest,
      packageDigest: meta.packageDigest,
      files,
    }),
  );
  return files;
}
