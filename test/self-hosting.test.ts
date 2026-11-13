// Keeps the README's "Run inside your network" section true: the variables it lists are the
// variables the code reads, the files it names exist, and the stdio server really makes no
// outbound call (a recording preload refuses every fetch and TCP connect; a control proves it bites).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const readme = readFileSync("README.md", "utf8");
const start = readme.indexOf("## Run inside your network");
const rest = start < 0 ? "" : readme.slice(start);
const section = rest.slice(0, rest.indexOf("\n## ", 1) < 0 ? undefined : rest.indexOf("\n## ", 1));
const SPLIT = "**Read only by the command-line tools.**";
const [mcpPart = "", cliPart = ""] = section.split(SPLIT);

const rows = (text: string) =>
  new Map(
    [...text.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \| ([^|]*) \|/gm)].map((m) => [m[1], m[2].trim()]),
  );

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(p).isDirectory() ? files(p) : n.endsWith(".ts") ? [p] : [];
  });
}
const SRC = [
  ...files("src").filter((f) => !f.startsWith("src/ui/browser/")),
  "mcp.ts",
  "mcp-http.ts",
];
const MCP_FILES = ["mcp.ts", "mcp-http.ts", "src/mcp-server.ts", "src/mcp-http.ts"];

/** name -> default text (`?? x`) for every env var read: env.NAME or env["NAME"]. */
function envReads(list: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of list) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(
      /\benv(?:\.([A-Z][A-Z0-9_]*)|\["([A-Z][A-Z0-9_]*)"\])(?:\s*\?\?\s*([^\s,;)]+))?/g,
    )) {
      const name = (m[1] ?? m[2])!;
      out.set(name, [...(out.get(name) ?? []), ...(m[3] ? [m[3]] : [])]);
    }
  }
  return out;
}

test("self-hosting: the section exists and names its parts", () => {
  assert.ok(start >= 0, "README has no 'Run inside your network' section");
  for (const part of [
    "**Container.**",
    "**Stdio.**",
    "**Environment variables the MCP server reads.**",
    SPLIT,
    "**Offline mode and how it is proven.**",
    "**What it never sends.**",
    "**Model endpoint.**",
    "**No hosted dependency.**",
  ])
    assert.ok(section.includes(part), `missing ${part}`);
});

test("self-hosting: the MCP server's variables are exactly the table's", () => {
  const read = [...envReads(MCP_FILES).keys()].toSorted();
  const listed = [...rows(mcpPart).keys()].toSorted();
  assert.deepEqual(listed, read);
});

test("self-hosting: every variable src/ reads is documented, every documented one is read", () => {
  const read = envReads(SRC);
  const listed = new Map([...rows(mcpPart), ...rows(cliPart)]);
  for (const name of read.keys())
    assert.ok(listed.has(name), `${name} is read under src/ but not in the README`);
  for (const name of listed.keys())
    assert.ok(read.has(name), `${name} is documented but not read under src/`);
});

test("self-hosting: documented numeric defaults match the code", () => {
  const listed = new Map([...rows(mcpPart), ...rows(cliPart)]);
  const consts = readFileSync("src/matchers/info.ts", "utf8");
  const relaxed = /DEFAULT_RELAXED_CONFIDENCE = (\d+)/.exec(consts)?.[1];
  assert.equal(listed.get("RELAXED_CONFIDENCE")?.replaceAll("`", ""), relaxed);
  for (const [name, defaults] of envReads(MCP_FILES))
    for (const d of defaults)
      if (/^[\d_]+$/.test(d))
        assert.equal(listed.get(name)?.replaceAll("`", ""), d.replaceAll("_", ""), name);
  assert.match(readFileSync("src/mcp-http.ts", "utf8"), /process\.env\.PORT \?\? 8080/);
  assert.match(readFileSync("src/serve.ts", "utf8"), /process\.env\.PORT \?\? 8650/);
  assert.ok(section.includes("(default 8650, loopback only)"));
});

test("self-hosting: the MCP server never reads the environment for matchers", () => {
  // buildMatchers(env) is called with an object built from the tool's arguments, not process.env.
  const text = readFileSync("src/mcp-server.ts", "utf8");
  assert.match(text, /buildMatchers\(env\)/);
  assert.doesNotMatch(text, /buildMatchers\(\s*\)/);
  assert.doesNotMatch(text, /buildMatchers\(process\.env/);
  assert.doesNotMatch(text, /\bai\s*:\s*true|aiNoRules|aiDefinitions/);
});

test("self-hosting: the Dockerfile matches the section", () => {
  const docker = readFileSync("Dockerfile", "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  assert.match(docker, /PORT=8080/);
  assert.match(docker, /^USER node$/m);
  assert.match(docker, /HEALTHCHECK[\s\S]*\/healthz/);
  assert.match(docker, /CMD \["node", "dist\/mcp-http\.js"\]/);
  assert.doesNotMatch(docker, /ANTHROPIC|TWILIO/);
  assert.match(readFileSync("package.json", "utf8"), /"name": "member-match-decoy-lab"/);
});

test("self-hosting: every file the section names exists", () => {
  for (const m of section.matchAll(/`((?:test|src|scripts)\/[A-Za-z0-9_./-]+)`/g))
    assert.ok(existsSync(m[1]), `${m[1]} named in the section does not exist`);
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const s of ["build", "start:http", "score", "serve", "console"])
    assert.ok(pkg.scripts[s], `npm run ${s}`);
  for (const f of ["dist/mcp.js", "dist/mcp-http.js"]) assert.ok(existsSync(f), `${f} not built`);
});

// --- zero egress, measured -------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "mm-egress-"));
const log = join(dir, "attempts.log");
const preload = join(dir, "block.mjs");
writeFileSync(
  preload,
  `import net from "node:net";
import { appendFileSync } from "node:fs";
const note = (what) => appendFileSync(${JSON.stringify(log)}, what + "\\n");
const loop = (h) => ["127.0.0.1", "::1", "localhost", undefined].includes(h);
const f = globalThis.fetch;
globalThis.fetch = (...a) => {
  const u = new URL(String(a[0] instanceof Request ? a[0].url : a[0]));
  if (loop(u.hostname.replace(/^\\[|\\]$/g, ""))) return f(...a);
  note("fetch " + u.href);
  return Promise.reject(new Error("egress blocked"));
};
const c = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const first = Array.isArray(a[0]) ? a[0][0] : a[0];
  const o = first && typeof first === "object" ? first : { port: first, host: typeof a[1] === "string" ? a[1] : undefined };
  if (o.path || loop(o.host)) return c.apply(this, a);
  note("connect " + JSON.stringify(o));
  throw new Error("egress blocked");
};
`,
);
const attempts = () => (existsSync(log) ? readFileSync(log, "utf8").trim() : "");

test("self-hosting control: the recording preload catches fetch and a TCP connect", () => {
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      preload,
      "-e",
      'fetch("http://203.0.113.1/").catch(()=>{});require("node:net").connect(9,"203.0.113.1")',
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(r.status, null);
  const seen = attempts();
  assert.match(seen, /fetch http:\/\/203\.0\.113\.1\//);
  assert.match(seen, /connect /);
  writeFileSync(log, "");
});

test("self-hosting: the stdio server runs the tool with no off-machine call", async () => {
  writeFileSync(log, "");
  const client = new Client({ name: "egress", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", preload, resolve("dist/mcp.js")],
      cwd: tmpdir(),
      stderr: "pipe",
    }),
  );
  try {
    const first = await client.callTool({ name: "score_member_match", arguments: {} });
    assert.ok(!first.isError);
    const second = await client.callTool({
      name: "score_member_match",
      arguments: { relaxed_confidence: 90, detail: "full" },
    });
    assert.ok(!second.isError);
  } finally {
    await client.close();
  }
  assert.equal(attempts(), "", "the server attempted an outbound call");
});
