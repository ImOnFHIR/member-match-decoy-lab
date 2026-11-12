import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { renderView, requiredText, esc } from "mcp-tool-console/render";
import { renderForm, formToArgs, widgetFor, argsSummary } from "mcp-tool-console/form";
import type { ToolView } from "mcp-tool-console";

const views = readdirSync("test/views").map(
  (f) => [f, JSON.parse(readFileSync(`test/views/${f}`, "utf8")) as ToolView] as const,
);

test("render: every conformance view shows all its required text", () => {
  for (const [f, v] of views) {
    const html = renderView(v);
    for (const t of requiredText(v)) assert.ok(html.includes(esc(t)), `${f}: missing "${t}"`);
    assert.match(html, /role="status"/, `${f}: headline isn't announced`);
  }
});

test("render: status is shown in words, not colour alone", () => {
  const html = renderView(views.find(([f]) => f === "default.json")![1]);
  assert.match(html, /Problem<\/span>/);
});

test("render: hostile tool output comes out escaped", () => {
  const evil = `<img src=x onerror=alert(1)>"'&`;
  const v: ToolView = {
    v: 1,
    status: "bad",
    headline: evil,
    banner: evil,
    stats: [{ label: evil, value: evil }],
    bullets: [{ text: evil, detail: evil }],
    sections: [
      {
        id: `x"><script>`,
        title: evil,
        blocks: [
          {
            kind: "table",
            columns: [{ key: "a", label: evil }],
            rows: [{ a: { text: evil, status: "bad" } }],
          },
          { kind: "kv", items: [{ label: evil, value: evil }] },
          { kind: "code", lang: "text", text: evil },
          { kind: "text", text: evil },
          { kind: "surprise", evil } as any,
        ],
      },
    ],
    next: [{ label: evil, patch: { x: evil } }],
    footnote: evil,
  };
  const html = renderView(v, { withNext: true });
  // Escaped text may still contain the word "onerror"; what must never appear is a live tag.
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("render: unknown block kinds are shown, not dropped; sections start collapsed", () => {
  const html = renderView({
    v: 1,
    status: "info",
    headline: "h",
    sections: [{ id: "s", title: "S", blocks: [{ kind: "chart", series: [1, 2] } as any] }],
  });
  assert.match(html, /&quot;chart&quot;/);
  assert.doesNotMatch(html, /<details[^>]*open/);
});

test("render: tables carry data-label for phone cards", () => {
  const html = renderView(views[0][1]);
  assert.match(html, /<td data-label="Test">/);
});

// The real score_member_match inputSchema, as the MCP server lists it.
async function listSchema() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const c = new Client({ name: "t", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/mcp.js"] }));
  const { tools } = await c.listTools();
  await c.close();
  return tools[0].inputSchema as any;
}
const schema = await listSchema();

test("form: picks the right widget for each input and labels every one", () => {
  assert.equal(widgetFor(schema.properties.matchers).kind, "chips");
  assert.equal(widgetFor(schema.properties.cases).kind, "chips");
  assert.equal(widgetFor(schema.properties.relaxed_confidence).kind, "range");
  assert.equal(widgetFor(schema.properties.detail).kind, "select");
  const html = renderForm(schema, {}, ["relaxed_confidence", "detail"]);
  for (const [k, s] of Object.entries<any>(schema.properties))
    assert.ok(html.includes(esc(s.title)), `${k} label`);
  assert.match(html, /Scored identity matcher, strict/);
  assert.match(html, /John&#39;s demographics, Jon&#39;s card/);
  assert.match(html, /<details class="f-advanced"><summary>More settings<\/summary>/);
  // every input has a label pointing at it
  for (const m of html.matchAll(/<(input|select|textarea)[^>]*id="([^"]+)"/g)) {
    if (m[2].endsWith("-slider")) continue; // the slider is labelled by aria-label
    assert.ok(html.includes(`for="${m[2]}"`), `no label for ${m[2]}`);
  }
});

test("form: entries become tool arguments; blanks fall back to defaults; bad values explained", () => {
  assert.deepEqual(
    formToArgs(schema, [
      ["cases", "D4-card-mixup"],
      ["relaxed_confidence", "90"],
      ["detail", ""],
    ]).args,
    { cases: ["D4-card-mixup"], relaxed_confidence: 90 },
  );
  assert.deepEqual(formToArgs(schema, []).args, {});
  assert.deepEqual(formToArgs(schema, [["relaxed_confidence", "50"]]).problems, [
    "Relaxed matcher confidence (%): choose from 75 to 100",
  ]);
  assert.deepEqual(formToArgs(schema, [["relaxed_confidence", "88.5"]]).problems, [
    "Relaxed matcher confidence (%): enter a whole number",
  ]);
  const paste = { type: "object", properties: { bundle: { type: "object", title: "PAS Bundle" } } };
  assert.deepEqual(formToArgs(paste, [["bundle", "{oops"]]).problems, [
    "PAS Bundle: this isn't valid JSON",
  ]);
});

test("form: the one-line settings summary uses plain names", () => {
  assert.equal(argsSummary(schema, {}), "Default settings");
  assert.equal(
    argsSummary(schema, { cases: ["D4-card-mixup"], relaxed_confidence: 90 }),
    "Test requests to run: John's demographics, Jon's card · Relaxed matcher confidence (%): 90",
  );
});
