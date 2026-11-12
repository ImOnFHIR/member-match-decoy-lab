import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer } from "../src/mcp-http.js";

const server = createHttpServer({ maxBodyBytes: 20_000 });
let base = "";
const stdio = new Client({ name: "test-stdio", version: "0" });
const http = new Client({ name: "test-http", version: "0" });

before(async () => {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await stdio.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/mcp.js")],
      cwd: tmpdir(),
      stderr: "pipe",
    }),
  );
  await http.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});
after(async () => {
  await http.close();
  await stdio.close();
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
});

const post = (body: string) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body,
  });

test("http: tools/list equals the stdio tool list", async () => {
  const a = await stdio.listTools();
  const b = await http.listTools();
  assert.deepEqual(
    b.tools.map((t) => t.name),
    ["score_member_match"],
  );
  assert.deepEqual(b, a);
});

test("http: a default score_member_match call matches the stdio call", async () => {
  const args = { matchers: ["id-first", "identity-relaxed"], cases: ["D4-card-mixup"] };
  const a: any = await stdio.callTool({ name: "score_member_match", arguments: args });
  const b: any = await http.callTool({ name: "score_member_match", arguments: args });
  assert.notEqual(b.isError, true);
  assert.deepEqual(b.structuredContent, a.structuredContent);
  const full: any = await http.callTool({ name: "score_member_match", arguments: {} });
  const fullStdio: any = await stdio.callTool({ name: "score_member_match", arguments: {} });
  assert.deepEqual(full.structuredContent, fullStdio.structuredContent);
  assert.match(full.structuredContent.headline, /1 of 4 matchers/);
});

test("http: /healthz is 200 ok", async () => {
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "ok");
});

test("http: a non-MCP path is a JSON 404", async () => {
  const r = await fetch(`${base}/nope`);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "Not found" });
  assert.equal((await fetch(`${base}/mcp`)).status, 405);
});

test("http: an AI matcher is refused cleanly and the server keeps serving", async () => {
  const bad: any = await http
    .callTool({ name: "score_member_match", arguments: { matchers: ["ai-with-rules"] } })
    .catch((e) => ({ isError: true, e }));
  assert.equal(bad.isError, true);
  const ok: any = await http.callTool({ name: "score_member_match", arguments: {} });
  assert.notEqual(ok.isError, true);
});

test("http: bad JSON is 400 and an oversize body is 413, both plain JSON", async () => {
  const bad = await post("{nope");
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, -32700);
  const big = await post(JSON.stringify({ pad: "x".repeat(30_000) }));
  assert.equal(big.status, 413);
  assert.equal((await big.json()).jsonrpc, "2.0");
});
