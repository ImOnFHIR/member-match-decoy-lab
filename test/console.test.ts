// This repo's tool in the dev console from mcp-tool-console (the console's own rules are tested there).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConsoleConfig, Hub } from "mcp-tool-console/console";

// Only the committed console.config.json: a developer's console.local.json never runs during tests.
const committed = JSON.parse(readFileSync("console.config.json", "utf8"));
const dir = mkdtempSync(join(tmpdir(), "decoy-console-"));
writeFileSync(join(dir, "console.config.json"), JSON.stringify({ servers: [] }));
writeFileSync(
  join(dir, "console.local.json"),
  JSON.stringify({
    servers: committed.servers.map((s: any) => ({ ...s, cwd: resolve(s.cwd ?? ".") })),
  }),
);
const hub = new Hub(loadConsoleConfig(dir));
after(() => hub.stopAll());

test("console: the committed config starts this repo's server with its one tool", async () => {
  await hub.startAll();
  const servers = hub.overview();
  assert.equal(servers.length, 1);
  const [s] = servers;
  assert.equal(s.id, "decoy-lab");
  assert.equal(s.status, "ready");
  assert.deepEqual(
    s.tools.map((t: any) => t.name),
    ["score_member_match"],
  );
  assert.equal(s.launch, "node dist/mcp.js");
});

test("console: the real decoy tool runs and returns its view", async () => {
  const r: any = await hub.call(
    "decoy-lab",
    "score_member_match",
    { cases: ["D4-card-mixup"] },
    "t1",
  );
  assert.equal(r._meta["com.imonfhir/view"].status, "bad");
});
