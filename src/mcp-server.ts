/**
 * MCP server (stdio) with one read-only tool: score_member_match.
 * Written for a person reading it in an MCP client: plain names, plain settings, a report in words.
 *   npx @modelcontextprotocol/inspector node dist/mcp.js
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildMatchers, MATCHER_INFO, DEFAULT_RELAXED_CONFIDENCE } from "./matchers/registry.js";
import { runScoreboard } from "./run.js";
import { CATEGORIES } from "./scorer.js";
import { loadDecoys } from "./decoys.js";
import { befriend, renderText, renderSummary } from "./report.js";

/** Repo root, so the server works whatever directory the MCP client starts it from. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const set = loadDecoys(`${ROOT}/decoys/decoys.json`);
const FREE = MATCHER_INFO.filter((m) => !m.costsMoney);
const MATCHER_IDS = FREE.map((m) => m.id) as [string, ...string[]];
const CASE_IDS = set.cases.map((c) => c.id) as [string, ...string[]];

const DESCRIPTION = [
  "WHAT IT IS",
  "• A test bench for HRex $member-match: does a matcher send someone's records to the wrong person?",
  "",
  "WHAT IT DOES",
  `• Sends ${set.cases.length} synthetic test requests, each with a hidden trap, to up to ${FREE.length} matchers.`,
  "• Checks every answer against a locked answer key.",
  "• Tells you who got it right, who refused safely, and who sent records to the wrong person.",
  "",
  "SETTINGS (all optional)",
  `• matchers: which matchers to test. Default: all ${FREE.length}.`,
  `• cases: which test requests to run. Default: all ${set.cases.length}.`,
  `• relaxed_confidence: 75 to 100. Default ${DEFAULT_RELAXED_CONFIDENCE}.`,
  '• detail: "summary" (default) or "full".',
  "",
  "HOW TO USE",
  "• Run it with no settings to see the result.",
  '• Set detail to "full" to see every answer explained.',
  "",
  "MATCHERS",
  ...FREE.map((m) => `• ${m.id}: ${m.short}`),
  "",
  "TEST REQUESTS",
  ...set.cases.map((c) => `• ${c.id}: ${c.title}`),
  "",
  "SAFE TO RUN",
  "• Synthetic data. Read-only. Free. Nothing leaves this machine.",
].join("\n");

const Category = z.enum(CATEGORIES);
const outputSchema = {
  banner: z.string(),
  headline: z.string().describe("One sentence: did any matcher send records to the wrong person?"),
  manifestDigest: z.string().describe("Fingerprint of the locked answer key this run was checked against"),
  matchers: z.array(z.object({
    matcher: z.string(), label: z.string(), summary: z.string(),
    counts: z.record(Category, z.number()), correct: z.number(), total: z.number(),
  })),
  rows: z.array(z.object({
    matcher: z.string(), case: z.string(), title: z.string(), plain: z.string(),
    rightAnswer: z.string(), result: z.string(), explanation: z.string(),
    expected: z.string(), expectedMember: z.string().nullable(), observed: z.string(),
    category: Category, reasonMismatch: z.boolean(), wrongPerson: z.string().nullable(), subjectMemberId: z.string(),
  })),
};

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "member-match-decoy-lab", version: "0.1.0" });
  server.registerTool(
    "score_member_match",
    {
      title: "Member-match decoy test",
      description: DESCRIPTION,
      inputSchema: {
        matchers: z.array(z.enum(MATCHER_IDS)).optional()
          .describe(`Which matchers to test. Leave empty for all ${FREE.length}.`),
        cases: z.array(z.enum(CASE_IDS)).optional()
          .describe(`Which test requests to run. Leave empty for all ${set.cases.length}.`),
        relaxed_confidence: z.number().int().min(75).max(100).optional()
          .describe(`How sure (75 to 100%) the relaxed matcher must be to accept a look-alike. Default ${DEFAULT_RELAXED_CONFIDENCE}.`),
        detail: z.enum(["summary", "full"]).optional()
          .describe('"summary" (default): the result and the problems. "full": every answer, explained.'),
      },
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ matchers, cases, relaxed_confidence, detail }) => {
      const env = relaxed_confidence === undefined ? {} : { RELAXED_CONFIDENCE: String(relaxed_confidence) };
      const all = buildMatchers(env);
      const chosen = matchers?.length ? all.filter((m) => matchers.includes(m.name)) : all;
      const sb = befriend(await runScoreboard({ matchers: chosen, cases, dir: ROOT }), set);
      const text = detail === "full" ? renderText(sb) : renderSummary(sb);
      return { content: [{ type: "text", text }], structuredContent: { ...sb } };
    },
  );
  return server;
}

export async function main() {
  await createMcpServer().connect(new StdioServerTransport());
}
