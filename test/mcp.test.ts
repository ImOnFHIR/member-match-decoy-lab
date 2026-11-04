import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Spawn the built server the way an MCP client would, from an unrelated working directory.
const client = new Client({ name: "test", version: "0" });
before(async () => {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve("dist/mcp.js")], cwd: tmpdir(), stderr: "pipe" }));
});
after(() => client.close());

test("mcp: lists exactly one tool, score_member_match, read-only", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["score_member_match"]);
  assert.equal(tools[0].annotations?.readOnlyHint, true);
  assert.equal(tools[0].annotations?.destructiveHint, false);
  assert.ok(tools[0].outputSchema);
  assert.doesNotMatch(JSON.stringify(tools[0].inputSchema), /"llm/);
});

test("mcp: a call returns structured scores", async () => {
  const r: any = await client.callTool({ name: "score_member_match", arguments: {} });
  assert.notEqual(r.isError, true, JSON.stringify(r.content));
  const sc = r.structuredContent;
  assert.match(sc.banner, /Synthetic/);
  assert.equal(sc.manifestDigest.length, 64);
  const baseline = sc.matchers.find((m: any) => m.matcher === "baseline");
  assert.equal(baseline.counts["decoy-confusion"], 1);
  assert.equal(sc.rows.find((x: any) => x.matcher === "baseline" && x.case === "D4-card-mixup").wrongPerson, "SYN-MEM-1002-01");
  assert.match(r.content[0].text, /DECOY CONF\./);
});

test("mcp: matcher, case and threshold arguments narrow the run", async () => {
  const r: any = await client.callTool({ name: "score_member_match", arguments: { matchers: ["c057-tuned"], cases: ["D1-senior-junior"], c057AutoConfirm: 0.9 } });
  assert.equal(r.structuredContent.rows.length, 1);
  assert.equal(r.structuredContent.rows[0].category, "missed-match"); // 0.87 < 0.90
});

test("mcp: unknown matchers and out-of-range thresholds are rejected", async () => {
  const bad: any = await client.callTool({ name: "score_member_match", arguments: { matchers: ["llm"] } }).catch((e) => ({ isError: true, e }));
  assert.equal(bad.isError, true);
  const low: any = await client.callTool({ name: "score_member_match", arguments: { c057AutoConfirm: 0.5 } }).catch((e) => ({ isError: true, e }));
  assert.equal(low.isError, true);
});
