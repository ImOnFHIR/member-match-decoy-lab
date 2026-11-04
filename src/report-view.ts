/** score_member_match's result as a ToolView: what every surface shows. */
import type { FriendlyScoreboard } from "./report.js";
import { CATEGORIES, CATEGORY_INFO, CORRECT } from "./scorer.js";
import { labelFor, infoFor } from "./matchers/info.js";
import { LIMITS, type Bullet, type Status, type ToolView } from "./ui/view.js";

const clip = (s: string): { text: string; detail?: string } =>
  s.length <= LIMITS.bulletChars ? { text: s } : { text: s.slice(0, LIMITS.bulletChars - 1).trimEnd() + "…", detail: s };

export function toView(f: FriendlyScoreboard): ToolView {
  const anyWrong = f.matchers.some((m) => m.counts["decoy-confusion"] > 0);
  const cases = [...new Set(f.rows.map((r) => r.case))];

  const stats = f.matchers.map((m) => {
    const status: Status = m.counts["decoy-confusion"] > 0 ? "bad" : m.correct < m.total ? "warn" : "good";
    return { label: m.label, value: `${m.correct} of ${m.total} right`, status };
  });

  const bullets: Bullet[] = f.rows
    .filter((r) => !CORRECT.has(r.category))
    .map((r) => {
      const c = clip(`${labelFor(r.matcher)}: ${r.explanation}`);
      const detail = [c.detail, `Test: ${r.title}. ${r.plain}`, `Right answer: ${r.rightAnswer}`].filter(Boolean).join("\n");
      return { text: c.text, status: r.category === "decoy-confusion" ? "bad" : "warn", detail };
    });
  if (!bullets.length) bullets.push({ text: "No problems: every matcher gave a right answer on every test.", status: "good" });

  return {
    v: 1,
    status: anyWrong ? "bad" : bullets.some((b) => b.status === "warn") ? "warn" : "good",
    headline: f.headline,
    banner: f.banner,
    stats,
    bullets,
    sections: [
      {
        id: "answers", title: "Every answer", hint: `${f.rows.length} answers`,
        blocks: [{
          kind: "table",
          columns: [{ key: "test", label: "Test" }, { key: "matcher", label: "Matcher" }, { key: "result", label: "Result" }, { key: "why", label: "What happened" }],
          rows: f.rows.map((r) => ({
            test: r.title,
            matcher: labelFor(r.matcher),
            result: { text: `${CORRECT.has(r.category) ? "✓" : "✗"} ${r.result}`, status: CORRECT.has(r.category) ? "good" : r.category === "decoy-confusion" ? "bad" : "warn" },
            why: r.explanation,
          })),
        }],
      },
      {
        id: "tests", title: "The test requests", hint: `${cases.length} traps`,
        blocks: [{
          kind: "table",
          columns: [{ key: "test", label: "Test" }, { key: "trap", label: "What's tricky" }, { key: "right", label: "Right answer" }],
          rows: cases.map((c) => { const r = f.rows.find((x) => x.case === c)!; return { test: r.title, trap: r.plain, right: r.rightAnswer }; }),
        }],
      },
      {
        id: "matchers", title: "How each matcher works", hint: `${f.matchers.length} matchers`,
        blocks: [{ kind: "bullets", items: f.matchers.map((m) => ({ text: `${m.label}: ${infoFor(m.matcher)?.short ?? ""}`, detail: m.summary })) }],
      },
      {
        id: "legend", title: "What the results mean", hint: `${CATEGORIES.length} results`,
        blocks: [{ kind: "kv", items: CATEGORIES.map((c) => ({ label: `${CORRECT.has(c) ? "✓" : "✗"} ${CATEGORY_INFO[c].label}`, value: CATEGORY_INFO[c].meaning })) }],
      },
    ],
    footnote: `Checked against the locked answer key ${f.manifestDigest.slice(0, 12)}. Any HRex 422 refusal where one is due counts as right.`,
  };
}
