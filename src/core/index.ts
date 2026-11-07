/**
 * The browser core: score the synthetic decoys in memory, with no files, network or Node APIs.
 * Used by the imonfhir.com workbench page (vendored, hash-pinned) and the in-Claude view.
 * Same decisions as the MCP tool: test/core-parity.test.ts proves it, row for row.
 */
import type { DecoySet } from "../decoys.js";
import type { Manifest } from "../manifest.js";
import { roster } from "../population.js";
import { handle } from "../endpoint-core.js";
import { buildFreeMatchers } from "../matchers/free.js";
import { MATCHER_INFO, relaxedConfidence, DEFAULT_RELAXED_CONFIDENCE } from "../matchers/info.js";
import { scoreOne, tally, type Answer } from "../scorer.js";
import { befriend, renderSummary, type FriendlyScoreboard } from "../report.js";
import { toView } from "../report-view.js";
import type { ToolView } from "../ui/view.js";

export { checkView, type ToolView } from "../ui/view.js";
export { MATCHER_INFO, DEFAULT_RELAXED_CONFIDENCE } from "../matchers/info.js";
export { CATEGORY_INFO, CATEGORIES } from "../scorer.js";
export { SYNTHETIC_BANNER } from "../index.js";

/** Everything the core needs, built and lock-verified in Node (scripts/vendor-build.mjs). */
export interface CoreData {
  decoys: DecoySet;
  manifest: Manifest;
  /** case id → the exact $member-match Parameters request. */
  requests: Record<string, unknown>;
  /** sha256 of the locked answer key (manifest/ground-truth.sha256). */
  lockDigest: string;
}

export interface ScoreOptions {
  /** Matcher ids (default: all four free ones). */
  matchers?: string[];
  /** Case ids (default: all). */
  cases?: string[];
  /** 75–100 (default 85). */
  relaxedConfidence?: number;
}

export interface CoreResult {
  scoreboard: FriendlyScoreboard;
  view: ToolView;
  summary: string;
}

export async function scoreDecoys(data: CoreData, o: ScoreOptions = {}): Promise<CoreResult> {
  const pct = o.relaxedConfidence ?? DEFAULT_RELAXED_CONFIDENCE;
  const all = buildFreeMatchers(relaxedConfidence({ RELAXED_CONFIDENCE: String(pct) }));
  const unknown = (o.matchers ?? []).filter((id) => !all.some((m) => m.name === id));
  if (unknown.length) throw new Error(`unknown matcher(s): ${unknown.join(", ")}`);
  const matchers = o.matchers?.length ? all.filter((m) => o.matchers!.includes(m.name)) : all;
  const entries = data.manifest.entries.filter((e) => !o.cases?.length || o.cases.includes(e.case));
  if (o.cases?.length && entries.length !== o.cases.length)
    throw new Error(
      `unknown case(s): ${o.cases.filter((c) => !entries.some((e) => e.case === c)).join(", ")}`,
    );

  const endpoint = {
    matchers,
    roster: roster(data.decoys),
    consent: {
      asOf: data.decoys.asOf,
      canSegmentSensitive: data.decoys.targetPayer.canSegmentSensitive,
    },
  };
  const rows = [];
  for (const m of matchers) {
    for (const e of entries) {
      const request = data.requests[e.case];
      if (!request) throw new Error(`no request for ${e.case}`);
      let a: Answer;
      try {
        const r = await handle(endpoint, m.name, structuredClone(request));
        a = { status: r.status, body: r.body };
      } catch (err) {
        a = { status: 500, error: (err as Error).message };
      }
      rows.push(scoreOne(m.name, e, a));
    }
  }
  const scoreboard = befriend(tally(rows, data.lockDigest), data.decoys);
  return { scoreboard, view: toView(scoreboard), summary: renderSummary(scoreboard) };
}

/** The free matchers' plain names, for building a form. */
export const FREE_MATCHERS = MATCHER_INFO.filter((m) => !m.costsMoney);
