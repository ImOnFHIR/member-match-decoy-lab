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
import { befriend, renderText } from "./report.js";

/** Repo root, so the server works whatever directory the MCP client starts it from. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const set = loadDecoys(`${ROOT}/decoys/decoys.json`);
const FREE = MATCHER_INFO.filter((m) => !m.costsMoney);
const MATCHER_IDS = FREE.map((m) => m.id) as [string, ...string[]];
const CASE_IDS = set.cases.map((c) => c.id) as [string, ...string[]];

const DESCRIPTION = [
  "Tests how safely different member-matching approaches answer Da Vinci HRex $member-match requests.",
  "",
  "Each test request hides a trap: a look-alike member (a near-twin name, a father and son on one card, twins, a borrowed card) or a consent the plan can't honour. Every matcher answers every request, and each answer is checked against a locked answer key.",
  "",
  "You get back a plain-English report: which matchers found the right person, which rightly refused, and which sent someone's records to the wrong person, with names.",
  "",
  "Matchers:",
  ...FREE.map((m) => `- ${m.id}: ${m.label}. ${m.summary}`),
  "",
  "Decoys:",
  ...set.cases.map((c) => `- ${c.id}: ${c.title}. ${c.plain}`),
  "",
  "All data is synthetic. Read-only, free (no AI calls), and nothing leaves this machine.",
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
      title: "Test member-match matchers against look-alike decoys",
      description: DESCRIPTION,
      inputSchema: {
        matchers: z.array(z.enum(MATCHER_IDS)).optional()
          .describe(`Which matchers to test. Leave empty to test all four: ${FREE.map((m) => `${m.id} (${m.label})`).join(", ")}.`),
        cases: z.array(z.enum(CASE_IDS)).optional()
          .describe(`Which decoys to run. Leave empty to run all six: ${set.cases.map((c) => `${c.id} (${c.title})`).join(", ")}.`),
        relaxed_confidence: z.number().int().min(75).max(100).optional()
          .describe(`How sure, from 75 to 100 percent, the relaxed identity matcher must be before it accepts a single look-alike. Default ${DEFAULT_RELAXED_CONFIDENCE}. The strict matcher always uses 90.`),
      },
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ matchers, cases, relaxed_confidence }) => {
      const env = relaxed_confidence === undefined ? {} : { RELAXED_CONFIDENCE: String(relaxed_confidence) };
      const all = buildMatchers(env);
      const chosen = matchers?.length ? all.filter((m) => matchers.includes(m.name)) : all;
      const sb = befriend(await runScoreboard({ matchers: chosen, cases, dir: ROOT }), set);
      return { content: [{ type: "text", text: renderText(sb) }], structuredContent: { ...sb } };
    },
  );
  return server;
}

export async function main() {
  await createMcpServer().connect(new StdioServerTransport());
}
