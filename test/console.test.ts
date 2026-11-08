// This repo's tool in the dev console from mcp-tool-console (the console's own rules are tested there).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadConsoleConfig, Hub } from "mcp-tool-console/console";

const hub = new Hub(loadConsoleConfig("."));
after(() => hub.stopAll());

test("console: the committed config starts this repo's server with its one tool", async () => {
  await hub.startAll();
  const [s] = hub.overview();
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
