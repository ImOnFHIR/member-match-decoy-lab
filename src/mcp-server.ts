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
import { toView } from "./report-view.js";
import { describe, toolMeta, resultMeta, type About, type Preset } from "./tool-meta.js";
import { existsSync, readFileSync } from "node:fs";

/** The in-Claude view (MCP Apps). Built by `npm run ui:build`; if it isn't built, the tool simply has no view. */
export const VIEW_URI = "ui://member-match-decoy-lab/view.html";
export const VIEW_MIME = "text/html;profile=mcp-app";

/** Repo root, so the server works whatever directory the MCP client starts it from. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VIEW_FILE = `${ROOT}/dist/ui/view.html`;
const set = loadDecoys(`${ROOT}/decoys/decoys.json`);
const FREE = MATCHER_INFO.filter((m) => !m.costsMoney);

export const ABOUT: About = {
  whatItIs: [
    "A test bench for HRex $member-match: does a matcher send someone's records to the wrong person?",
  ],
  whatItDoes: [
    `Sends ${set.cases.length} synthetic test requests, each with a hidden trap, to up to ${FREE.length} matchers.`,
    "Checks every answer against a locked answer key.",
    "Tells you who got it right, who refused safely, and who sent records to the wrong person.",
  ],
  howToUse: [
    "Run it with no settings to see the result.",
    'Set detail to "full" to see every answer explained.',
  ],
  safeToRun: ["Synthetic data. Read-only. Free. Nothing leaves this machine."],
};

export const PRESETS: Preset[] = [
  { id: "everything", label: "Run everything", args: {} },
  { id: "borrowed-card", label: "Try: the borrowed card", args: { cases: ["D4-card-mixup"] } },
  { id: "twins", label: "Try: the twins", args: { cases: ["D2-twins"] } },
  { id: "father-son", label: "Try: father and son", args: { cases: ["D1-senior-junior"] } },
  {
    id: "consent",
    label: "Try: the consent problems",
    args: { cases: ["D3-consent-expired", "D3b-consent-unsegmentable"] },
  },
  {
    id: "stricter",
    label: "Try: a stricter relaxed matcher (90%)",
    args: { relaxed_confidence: 90 },
  },
];

const DESCRIPTION = describe(ABOUT, {
  settings: [
    `matchers: which matchers to test. Default: all ${FREE.length}.`,
    `cases: which test requests to run. Default: all ${set.cases.length}.`,
    `relaxed_confidence: 75 to 100. Default ${DEFAULT_RELAXED_CONFIDENCE}.`,
    'detail: "summary" (default) or "full".',
  ],
  lists: [
    { title: "MATCHERS", items: FREE.map((m) => `${m.id}: ${m.short}`) },
    { title: "TEST REQUESTS", items: set.cases.map((c) => `${c.id}: ${c.title}`) },
  ],
});

/** A choice list whose JSON Schema carries a plain title per value: anyOf [{ const, title }]. */
const labelled = (items: { id: string; title: string }[]) =>
  z.union(
    items.map((i) => z.literal(i.id).meta({ title: i.title })) as unknown as [
      z.ZodLiteral<string>,
      z.ZodLiteral<string>,
      ...z.ZodLiteral<string>[],
    ],
  );

const Category = z.enum(CATEGORIES);
const outputSchema = {
  banner: z.string(),
  headline: z.string().describe("One sentence: did any matcher send records to the wrong person?"),
  manifestDigest: z
    .string()
    .describe("Fingerprint of the locked answer key this run was checked against"),
  matchers: z.array(
    z.object({
      matcher: z.string(),
      label: z.string(),
      summary: z.string(),
      counts: z.record(Category, z.number()),
      correct: z.number(),
      total: z.number(),
    }),
  ),
  rows: z.array(
    z.object({
      matcher: z.string(),
      case: z.string(),
      title: z.string(),
      plain: z.string(),
      rightAnswer: z.string(),
      result: z.string(),
      explanation: z.string(),
      expected: z.string(),
      expectedMember: z.string().nullable(),
      observed: z.string(),
      category: Category,
      reasonMismatch: z.boolean(),
      wrongPerson: z.string().nullable(),
      subjectMemberId: z.string(),
    }),
  ),
};

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "member-match-decoy-lab", version: "0.1.0" });
  server.registerTool(
    "score_member_match",
    {
      title: "Member-match decoy test",
      description: DESCRIPTION,
      inputSchema: {
        matchers: z
          .array(labelled(FREE.map((m) => ({ id: m.id, title: m.label }))))
          .optional()
          .meta({ title: "Matchers to test", examples: [["id-first", "check-every-field"]] })
          .describe(`Which matchers to test. Leave empty for all ${FREE.length}.`),
        cases: z
          .array(labelled(set.cases.map((c) => ({ id: c.id, title: c.title }))))
          .optional()
          .meta({ title: "Test requests to run", examples: [["D4-card-mixup"]] })
          .describe(`Which test requests to run. Leave empty for all ${set.cases.length}.`),
        relaxed_confidence: z
          .number()
          .int()
          .min(75)
          .max(100)
          .optional()
          .meta({ title: "Relaxed matcher confidence (%)", examples: [90] })
          .describe(
            `How sure (75 to 100%) the relaxed matcher must be to accept a look-alike. Default ${DEFAULT_RELAXED_CONFIDENCE}.`,
          ),
        detail: labelled([
          { id: "summary", title: "Summary: the result and the problems" },
          { id: "full", title: "Full: every answer, explained" },
        ])
          .optional()
          .meta({ title: "How much to show" })
          .describe(
            '"summary" (default): the result and the problems. "full": every answer, explained.',
          ),
      },
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ...toolMeta({
          about: ABOUT,
          presets: PRESETS,
          cost: { free: true },
          form: { advanced: ["relaxed_confidence", "detail"] },
        }),
        // MCP Apps: both key forms, as @modelcontextprotocol/ext-apps registerAppTool writes them.
        ...(existsSync(VIEW_FILE)
          ? { ui: { resourceUri: VIEW_URI }, "ui/resourceUri": VIEW_URI }
          : {}),
      },
    },
    async ({ matchers, cases, relaxed_confidence, detail }) => {
      const env =
        relaxed_confidence === undefined ? {} : { RELAXED_CONFIDENCE: String(relaxed_confidence) };
      const all = buildMatchers(env);
      const chosen = matchers?.length ? all.filter((m) => matchers.includes(m.name)) : all;
      const sb = befriend(await runScoreboard({ matchers: chosen, cases, dir: ROOT }), set);
      const text = detail === "full" ? renderText(sb) : renderSummary(sb);
      return {
        content: [{ type: "text", text }],
        structuredContent: { ...sb },
        _meta: resultMeta(toView(sb)),
      };
    },
  );
  if (existsSync(VIEW_FILE)) {
    server.registerResource(
      "Member-match decoy test view",
      VIEW_URI,
      { mimeType: VIEW_MIME, description: "Shows a score_member_match result as a card." },
      async () => ({
        contents: [{ uri: VIEW_URI, mimeType: VIEW_MIME, text: readFileSync(VIEW_FILE, "utf8") }],
      }),
    );
  }
  return server;
}

export async function main() {
  await createMcpServer().connect(new StdioServerTransport());
}
