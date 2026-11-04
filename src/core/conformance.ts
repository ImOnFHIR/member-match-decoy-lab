/**
 * The conformance set: sample runs whose ToolViews every renderer (console, in-Claude view,
 * imonfhir's React card) must show correctly. Committed under test/views/; vendored under views/.
 */
import type { ScoreOptions } from "./index.js";

export const CONFORMANCE_RUNS: { id: string; options: ScoreOptions }[] = [
  { id: "default", options: {} },
  { id: "borrowed-card", options: { cases: ["D4-card-mixup"] } },
  { id: "father-son-90", options: { cases: ["D1-senior-junior"], relaxedConfidence: 90 } },
  { id: "all-correct", options: { matchers: ["check-every-field"] } },
];
