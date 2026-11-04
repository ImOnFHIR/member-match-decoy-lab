import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { VIEW_URI, VIEW_MIME } from "../src/mcp-server.js";

const client = new Client({ name: "test", version: "0" });
before(async () => { await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve("dist/mcp.js")], cwd: tmpdir() })); });
after(() => client.close());

test("mcp app: the tool points at its view with both key forms", async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  const m: any = tools[0]._meta;
  assert.equal(m.ui.resourceUri, VIEW_URI);
  assert.equal(m["ui/resourceUri"], VIEW_URI);
});

test("mcp app: the view resource is listed and served with the MCP Apps mime type", async () => {
  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === VIEW_URI && r.mimeType === VIEW_MIME));
  const r: any = await client.readResource({ uri: VIEW_URI });
  assert.equal(r.contents[0].mimeType, VIEW_MIME);
  assert.match(r.contents[0].text, /^<!doctype html>/);
});

test("mcp app: the view is one self-contained file that loads nothing", () => {
  const html = readFileSync("dist/ui/view.html", "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=|<link\b|@import|url\(\s*["']?https?:/i);
  assert.doesNotMatch(html, /\bfetch\(|new WebSocket|XMLHttpRequest|sendBeacon|new Function/);
  // 527 KB today, almost all zod (used by @modelcontextprotocol/ext-apps). Ceiling, not a target.
  assert.ok(html.length < 600 * 1024, `view.html is ${Math.round(html.length / 1024)} KB`);
});

test("mcp app: the text answer is unchanged for hosts without MCP Apps", async () => {
  const r: any = await client.callTool({ name: "score_member_match", arguments: { cases: ["D4-card-mixup"] } });
  assert.match(r.content[0].text, /^Synthetic data only/);
  assert.match(r.content[0].text, /RESULT: /);
});
