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
  assert.doesNotMatch(JSON.stringify(tools[0].inputSchema), /ai-with-rules|ai-no-rules/);
  assert.match(tools[0].description ?? "", /wrong person/);
  assert.match(JSON.stringify(tools[0].inputSchema), /relaxed_confidence/);
  assert.doesNotMatch(JSON.stringify(tools[0].inputSchema), /c057|AutoConfirm/);
});

test("mcp: a call returns structured scores", async () => {
  const r: any = await client.callTool({ name: "score_member_match", arguments: {} });
  assert.notEqual(r.isError, true, JSON.stringify(r.content));
  const sc = r.structuredContent;
  assert.match(sc.banner, /Synthetic/);
  assert.equal(sc.manifestDigest.length, 64);
  const baseline = sc.matchers.find((m: any) => m.matcher === "id-first");
  assert.equal(baseline.label, "ID-first rules");
  assert.match(sc.headline, /1 of 4 matchers sent someone's records to the wrong person/);
  assert.equal(baseline.counts["decoy-confusion"], 1);
  assert.equal(sc.rows.find((x: any) => x.matcher === "id-first" && x.case === "D4-card-mixup").wrongPerson, "SYN-MEM-1002-01");
  assert.match(r.content[0].text, /Sent Jon Roe's records in answer to a request for John Roe/);
});

test("mcp: matcher, decoy and confidence arguments narrow the run", async () => {
  const r: any = await client.callTool({ name: "score_member_match", arguments: { matchers: ["identity-relaxed"], cases: ["D1-senior-junior"], relaxed_confidence: 90 } });
  assert.equal(r.structuredContent.rows.length, 1);
  assert.equal(r.structuredContent.rows[0].category, "missed-match"); // 0.87 < 0.90
});

test("mcp: unknown matchers and out-of-range thresholds are rejected", async () => {
  const bad: any = await client.callTool({ name: "score_member_match", arguments: { matchers: ["ai-with-rules"] } }).catch((e) => ({ isError: true, e }));
  assert.equal(bad.isError, true);
  const low: any = await client.callTool({ name: "score_member_match", arguments: { relaxed_confidence: 50 } }).catch((e) => ({ isError: true, e }));
  assert.equal(low.isError, true);
});

test("mcp: description is short labelled sections, not narrative", async () => {
  const { tools } = await client.listTools();
  const d = tools[0].description ?? "";
  for (const h of ["WHAT IT IS", "WHAT IT DOES", "SETTINGS", "HOW TO USE", "MATCHERS", "TEST REQUESTS", "SAFE TO RUN"]) assert.ok(d.includes(h), h);
  for (const line of d.split("\n").filter((l) => l.startsWith("•"))) assert.ok(line.length <= 110, `long line: ${line}`);
});

test("mcp: summary by default, every answer with detail=full", async () => {
  const short: any = await client.callTool({ name: "score_member_match", arguments: {} });
  const full: any = await client.callTool({ name: "score_member_match", arguments: { detail: "full" } });
  assert.match(short.content[0].text, /^RESULT: /m);
  assert.match(short.content[0].text, /PROBLEMS/);
  assert.doesNotMatch(short.content[0].text, /THE DECOYS/);
  assert.match(full.content[0].text, /THE DECOYS/);
  assert.ok(short.content[0].text.split("\n").length < 25);
});
