/**
 * MCP server (stdio) with one read-only tool: score_member_match.
 * Runs the rule-based matchers over the synthetic decoys and returns the scoreboard.
 * The LLM matcher is not exposed here: a tool call must never spend money unprompted.
 *   npx @modelcontextprotocol/inspector node dist/mcp.js
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildMatchers } from "./matchers/registry.js";
import { runScoreboard } from "./run.js";
import { CATEGORIES, render } from "./scorer.js";
import { loadDecoys } from "./decoys.js";
import { SYNTHETIC_BANNER } from "./index.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/** Repo root, so the server works whatever directory the MCP client starts it from. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MATCHER_NAMES = buildMatchers({}).map((m) => m.name) as [string, ...string[]];
const CASE_IDS = loadDecoys(`${ROOT}/decoys/decoys.json`).cases.map((c) => c.id) as [string, ...string[]];

const Category = z.enum(CATEGORIES);
const outputSchema = {
  banner: z.string(),
  manifestDigest: z.string().describe("sha256 of the digest-locked ground truth the run was scored against"),
  matchers: z.array(z.object({
    matcher: z.string(),
    counts: z.record(Category, z.number()),
    correct: z.number(),
    total: z.number(),
  })),
  rows: z.array(z.object({
    matcher: z.string(),
    case: z.string(),
    expected: z.string(),
    expectedMember: z.string().nullable(),
    observed: z.string(),
    category: Category,
    reasonMismatch: z.boolean(),
    wrongPerson: z.string().nullable(),
  })),
};

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "member-match-decoy-lab", version: "0.1.0" });
  server.registerTool(
    "score_member_match",
    {
      title: "Score $member-match matchers against planted decoys",
      description:
        `${SYNTHETIC_BANNER} Runs Da Vinci HRex $member-match requests, each with a planted near-duplicate decoy, ` +
        "against rule-based matchers on a loopback endpoint, and scores every answer against digest-locked ground truth: " +
        "true match, correct no-match, correct refusal on multiple matches, consent-constrained, decoy confusion " +
        "(records sent to the wrong person), consent ignored, missed match, error. Read-only; makes no network calls beyond 127.0.0.1.",
      inputSchema: {
        matchers: z.array(z.enum(MATCHER_NAMES)).optional().describe(`Matchers to run (default all): ${MATCHER_NAMES.join(", ")}`),
        cases: z.array(z.enum(CASE_IDS)).optional().describe(`Decoy cases to run (default all): ${CASE_IDS.join(", ")}`),
        c057AutoConfirm: z.number().min(0.75).max(1).optional().describe("Auto-confirm line for the c057-tuned variant (default 0.85; C-057's own is 0.90)"),
      },
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ matchers, cases, c057AutoConfirm }) => {
      const env = c057AutoConfirm === undefined ? {} : { C057_AUTO_CONFIRM: String(c057AutoConfirm) };
      const all = buildMatchers(env);
      const chosen = matchers?.length ? all.filter((m) => matchers.includes(m.name)) : all;
      const sb = await runScoreboard({ matchers: chosen, cases, dir: ROOT });
      const structured = { banner: SYNTHETIC_BANNER, ...sb };
      return { content: [{ type: "text", text: `${SYNTHETIC_BANNER}\n\n${render(sb)}` }], structuredContent: structured };
    },
  );
  return server;
}

export async function main() {
  await createMcpServer().connect(new StdioServerTransport());
}
