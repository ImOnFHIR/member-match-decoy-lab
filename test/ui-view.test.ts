import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkView, type ToolView } from "../src/ui/view.js";
import { describe as describeTool } from "../src/tool-meta.js";
import { ABOUT, createMcpServer } from "../src/mcp-server.js";
import { toView } from "../src/report-view.js";
import { befriend } from "../src/report.js";
import { runScoreboard } from "../src/run.js";
import { buildMatchers } from "../src/matchers/registry.js";
import { loadDecoys } from "../src/decoys.js";

const ok: ToolView = { v: 1, status: "good", headline: "All good." };

test("tool-meta: describe() reproduces the tool description exactly", () => {
  const desc = (createMcpServer() as any)._registeredTools["score_member_match"].description;
  assert.equal(desc, readFileSync("fixtures/golden/tool-description.txt", "utf8"));
  assert.ok(describeTool(ABOUT).startsWith("WHAT IT IS\n• "));
});

test("checkView: a minimal view is valid", () => assert.deepEqual(checkView(ok), []));

test("checkView: every rule names its problem", () => {
  const bad: Record<string, unknown> = {
    "not an object": 5,
    "v must be 1": { ...ok, v: 2 },
    "status must be": { ...ok, status: "great" },
    "headline is required": { ...ok, headline: "" },
    "one line": { ...ok, headline: "a\nb" },
    "keep bullets to 110": { ...ok, bullets: [{ text: "x".repeat(111) }] },
    "duplicate id": { ...ok, sections: [{ id: "a", title: "A", blocks: [] }, { id: "a", title: "B", blocks: [] }] },
    "cut to 200": { ...ok, sections: [{ id: "a", title: "A", blocks: [{ kind: "table", columns: [{ key: "k", label: "K" }], rows: Array(201).fill({ k: "x" }) }] }] },
    "needs label and patch": { ...ok, next: [{ label: "x" }] },
    "under 50000": { ...ok, footnote: "x".repeat(50_001) },
  };
  for (const [want, v] of Object.entries(bad)) assert.ok(checkView(v).some((p) => p.includes(want)), `${want}: ${checkView(v).join("; ")}`);
});

test("checkView: unknown block kinds are allowed (forward compatible)", () => {
  assert.deepEqual(checkView({ ...ok, sections: [{ id: "a", title: "A", blocks: [{ kind: "chart", data: [] }] }] }), []);
});

test("report-view: the default run's view is valid, bad, and names the wrong-person release", async () => {
  const set = loadDecoys();
  const v = toView(befriend(await runScoreboard({ matchers: buildMatchers({}) }), set));
  assert.deepEqual(checkView(v), []);
  assert.equal(v.status, "bad");
  assert.match(v.headline, /1 of 4 matchers/);
  assert.equal(v.stats?.find((s) => s.label === "ID-first rules")?.status, "bad");
  assert.ok(v.bullets?.some((b) => b.status === "bad" && /Sent Jon Roe's records in answer to a request for John Roe/.test(b.text)));
  assert.deepEqual(v.sections?.map((s) => s.id), ["answers", "tests", "matchers", "legend"]);
  assert.ok(v.sections?.every((s) => !s.open), "sections start collapsed");
});

test("report-view: a clean run is good with a 'no problems' bullet", async () => {
  const set = loadDecoys();
  const v = toView(befriend(await runScoreboard({ matchers: buildMatchers({}).filter((m) => m.name === "check-every-field") }), set));
  assert.equal(v.status, "good");
  assert.match(v.bullets![0].text, /No problems/);
});
