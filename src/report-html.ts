/**
 * The scoreboard as one self-contained web page: report/scoreboard.html (npm run report).
 * Deterministic: no timestamps, so a test can prove the committed page matches the code.
 * fragment=true leaves out <!doctype>/<html>/<head>/<body> (for hosts that add their own).
 */
import type { DecoySet } from "./decoys.js";
import { CATEGORIES, CATEGORY_INFO, CORRECT, type Category } from "./scorer.js";
import { labelFor } from "./matchers/info.js";
import type { FriendlyScoreboard } from "./report.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const ok = (c: Category) => CORRECT.has(c);

const CSS = `
/* Layout: one reading column; a person strip of ID-card tiles; decoy-by-matcher grid that scrolls sideways on phones. */
:root {
  --paper: #f6f7f9; --panel: #ffffff; --ink: #18212b; --muted: #5b6672; --rule: #d9dee4;
  --accent: #1f5f8b; --good: #1d7a46; --good-bg: #e6f4ec; --bad: #b3261e; --bad-bg: #fbe9e7; --card: #eef3f8;
  --display: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #11161c; --panel: #171e26; --ink: #e6ebf0; --muted: #9aa6b2; --rule: #2a343f;
  --accent: #7fb6dd; --good: #6fcf97; --good-bg: #13291d; --bad: #ff8a80; --bad-bg: #331917; --card: #1c2631; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #11161c; --panel: #171e26; --ink: #e6ebf0; --muted: #9aa6b2; --rule: #2a343f;
  --accent: #7fb6dd; --good: #6fcf97; --good-bg: #13291d; --bad: #ff8a80; --bad-bg: #331917; --card: #1c2631; color-scheme: dark; }
body { background: var(--paper); color: var(--ink); font: 15px/1.55 var(--body); margin: 0; }
.wrap { max-width: 64rem; margin: 0 auto; padding-block: 2rem 3rem;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; gap: 2.5rem; }
h1, h2 { font-family: var(--display); text-wrap: balance; margin: 0; line-height: 1.15; }
h1 { font-size: clamp(1.6rem, 4vw, 2.3rem); font-weight: 600; }
h2 { font-size: 1.25rem; font-weight: 600; }
p { margin: 0; max-width: 65ch; }
.eyebrow { font: 600 0.72rem/1 var(--body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.banner { font-size: 0.85rem; color: var(--muted); border-left: 3px solid var(--accent); padding-left: 0.75rem; }
section { display: grid; gap: 1rem; }
.lede { font-size: 1.05rem; }
.headline.bad { color: var(--bad); } .headline.good { color: var(--good); }
.mono { font-family: var(--mono); font-size: 0.82em; font-variant-numeric: tabular-nums; }
/* matcher summary */
.matchers { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.75rem; }
.m { background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; padding: 0.9rem 1rem; display: grid; gap: 0.4rem; align-content: start; min-width: 0; }
.m .score { font: 600 1.5rem/1 var(--display); font-variant-numeric: tabular-nums; }
.m .score.bad { color: var(--bad); }
.m p { font-size: 0.86rem; color: var(--muted); }
/* people as ID cards */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)); gap: 0.75rem; }
.idcard { background: var(--card); border-radius: 8px; padding: 0.8rem 0.9rem; display: grid; gap: 0.15rem; min-width: 0; border: 1px solid var(--rule); }
.idcard .who { font-weight: 600; }
.idcard .meta { font-size: 0.8rem; color: var(--muted); }
.idcard .ids { font-family: var(--mono); font-size: 0.76rem; display: grid; grid-template-columns: auto 1fr; gap: 0 0.5rem; margin-top: 0.35rem; }
.idcard .ids span:nth-child(odd) { color: var(--muted); }
.shared { font-size: 0.8rem; color: var(--muted); }
/* decoys */
.decoys { display: grid; gap: 0.75rem; }
.decoy { background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; padding: 1rem; display: grid; gap: 0.5rem; }
.decoy h3 { margin: 0; font: 600 1.02rem/1.3 var(--body); }
.decoy .answer { font-size: 0.9rem; }
.decoy .answer b { font-weight: 600; }
.results { display: grid; gap: 0.3rem; margin: 0.25rem 0 0; padding: 0; list-style: none; }
.results li { display: grid; grid-template-columns: 1.5rem 11rem 1fr; gap: 0.5rem; align-items: baseline; font-size: 0.88rem; }
.results li .who { font-weight: 600; }
@media (max-width: 560px) { .results li { grid-template-columns: 1.5rem 1fr; } .results li .what { grid-column: 2; } }
.tick, .cross { font-weight: 700; text-align: center; border-radius: 4px; }
.tick { color: var(--good); } .cross { color: var(--bad); }
.results li.miss { background: var(--bad-bg); border-radius: 4px; padding: 0.2rem 0.3rem; margin-inline: -0.3rem; }
/* grid */
.scroll { overflow-x: auto; border: 1px solid var(--rule); border-radius: 6px; background: var(--panel); }
table { border-collapse: collapse; width: 100%; min-width: 40rem; font-size: 0.85rem; }
th, td { padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--rule); text-align: left; vertical-align: top; }
thead th { font-size: 0.78rem; color: var(--muted); font-weight: 600; }
td.cell { text-align: center; font-weight: 700; }
td.cell.good { color: var(--good); background: var(--good-bg); } td.cell.bad { color: var(--bad); background: var(--bad-bg); }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
/* legend */
dl.legend { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 0.9rem; margin: 0; font-size: 0.88rem; }
dl.legend dt { font-weight: 600; white-space: nowrap; } dl.legend dd { margin: 0; color: var(--muted); }
ul.bul { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.35rem; max-width: 70ch; }
ul.bul li::marker { color: var(--muted); }
.scorelist li { font-variant-numeric: tabular-nums; }
.scorelist .bad, .problems .bad { color: var(--bad); font-weight: 600; }
details { background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; }
details > summary { cursor: pointer; padding: 0.8rem 1rem; font: 600 1rem/1.3 var(--display); list-style: none; display: flex; justify-content: space-between; gap: 1rem; }
details > summary::-webkit-details-marker { display: none; }
details > summary::after { content: "+"; color: var(--muted); font-weight: 400; }
details[open] > summary::after { content: "–"; }
details > summary .hint { font: 400 0.85rem/1.3 var(--body); color: var(--muted); margin-left: auto; }
details > .inner { padding: 0 1rem 1rem; display: grid; gap: 1rem; }
.more { display: grid; gap: 0.6rem; }
footer { font-size: 0.8rem; color: var(--muted); display: grid; gap: 0.3rem; }
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

export function htmlReport(
  f: FriendlyScoreboard,
  set: DecoySet,
  o: { fragment?: boolean } = {},
): string {
  const caseIds = [...new Set(f.rows.map((r) => r.case))];
  const row = (m: string, c: string) => f.rows.find((r) => r.matcher === m && r.case === c)!;
  const anyWrong = f.matchers.some((m) => m.counts["decoy-confusion"] > 0);

  const people = set.coverages
    .map((cov) => {
      const p = set.people.find((x) => x.id === cov.beneficiary)!;
      const name = [p.name, p.suffix].filter(Boolean).join(" ");
      return `<div class="idcard"><span class="who">${esc(name)}</span>
      <span class="meta">Born ${esc(p.birthDate)} · ${esc(p.gender)} · ${esc(cov.relationship === "self" ? "subscriber" : cov.relationship)}</span>
      <div class="ids"><span>Member</span><span>${esc(cov.memberId)}</span><span>Subscriber</span><span>${esc(cov.subscriberId)}</span></div></div>`;
    })
    .join("\n");
  const sharedCards = [...new Set(set.coverages.map((c) => c.subscriberId))]
    .map((s) => ({ s, n: set.coverages.filter((c) => c.subscriberId === s).length }))
    .filter((x) => x.n > 1);

  const decoys = caseIds
    .map((c) => {
      const rs = f.rows.filter((r) => r.case === c);
      const items = rs
        .map(
          (r) =>
            `<li class="${ok(r.category) ? "" : "miss"}"><span class="${ok(r.category) ? "tick" : "cross"}" aria-label="${ok(r.category) ? "right" : "wrong"}">${ok(r.category) ? "✓" : "✗"}</span><span class="who">${esc(labelFor(r.matcher))}</span><span class="what">${esc(r.explanation)}</span></li>`,
        )
        .join("");
      return `<article class="decoy" id="${esc(c)}"><span class="eyebrow mono">${esc(c)}</span><h3>${esc(rs[0].title)}</h3>
      <p>${esc(rs[0].plain)}</p><p class="answer"><b>Right answer:</b> ${esc(rs[0].rightAnswer)}</p><ul class="results">${items}</ul></article>`;
    })
    .join("\n");

  const scoreItems = f.matchers
    .map((m) => {
      const wrong = m.counts["decoy-confusion"] > 0;
      return `<li><strong>${esc(m.label)}</strong>: ${m.correct} of ${m.total} right${wrong ? ` <span class="bad">✗ sent records to the wrong person</span>` : ""}</li>`;
    })
    .join("");
  const problemRows = f.rows.filter((r) => !ok(r.category));
  const problemItems = problemRows.length
    ? problemRows
        .map(
          (r) =>
            `<li><strong>${esc(labelFor(r.matcher))}</strong>, “${esc(r.title)}”: <span class="${r.category === "decoy-confusion" ? "bad" : ""}">${esc(r.explanation)}</span></li>`,
        )
        .join("")
    : "<li>None.</li>";
  const howItWorks = f.matchers
    .map((m) => `<li><strong>${esc(m.label)}</strong>: ${esc(m.summary)}</li>`)
    .join("");

  const head = `<tr><th scope="col">Decoy</th>${f.matchers.map((m) => `<th scope="col">${esc(m.label)}</th>`).join("")}</tr>`;
  const body = caseIds
    .map(
      (c) =>
        `<tr><th scope="row">${esc(row(f.matchers[0].matcher, c).title)}</th>${f.matchers
          .map((m) => {
            const r = row(m.matcher, c);
            return `<td class="cell ${ok(r.category) ? "good" : "bad"}" title="${esc(r.explanation)}">${ok(r.category) ? "✓" : "✗"}<br><span style="font-weight:400">${esc(CATEGORY_INFO[r.category].label)}</span></td>`;
          })
          .join("")}</tr>`,
    )
    .join("\n");

  const legend = CATEGORIES.map(
    (c) =>
      `<dt><span class="${ok(c) ? "tick" : "cross"}">${ok(c) ? "✓" : "✗"}</span> ${esc(CATEGORY_INFO[c].label)}</dt><dd>${esc(CATEGORY_INFO[c].meaning)}</dd>`,
  ).join("\n");

  const content = `<title>Member Match Decoy Lab</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Which member-matching approaches send records to the wrong person? Synthetic HRex $member-match decoys, scored.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>${CSS}</style>
<main class="wrap">
  <header style="display:grid;gap:0.6rem">
    <span class="eyebrow">Member Match Decoy Lab · HRex $member-match</span>
    <h1 class="headline ${anyWrong ? "bad" : "good"}">${esc(f.headline)}</h1>
    <ul class="bul">
      <li><strong>What it is:</strong> a test of whether member-matching sends someone’s records to the wrong person.</li>
      <li><strong>What it does:</strong> ${caseIds.length} synthetic requests, each with a hidden trap, sent to ${f.matchers.length} matchers and checked against a locked answer key.</li>
      <li><strong>How to use it:</strong> read the scores, then open any section below for details.</li>
    </ul>
    <p class="banner">${esc(f.banner)}</p>
  </header>

  <section aria-labelledby="h-scores"><h2 id="h-scores">Scores</h2><ul class="bul scorelist">${scoreItems}</ul></section>

  <section aria-labelledby="h-problems"><h2 id="h-problems">Problems</h2><ul class="bul problems">${problemItems}</ul></section>

  <section aria-labelledby="h-grid"><h2 id="h-grid">Every answer</h2><div class="scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div></section>

  <div class="more">
    <details id="more-matchers"><summary>How each matcher works <span class="hint">${f.matchers.length} matchers</span></summary><div class="inner"><ul class="bul">${howItWorks}</ul></div></details>
    <details id="more-members"><summary>The synthetic members <span class="hint">${set.coverages.length} people</span></summary><div class="inner">
      <p>Look-alikes planted on purpose: John Roe and Jon Roe, born eight days apart; two Rowan Quills on one card; twins Ada and Aya.</p>
      <div class="cards">${people}</div>
      ${sharedCards.length ? `<p class="shared">${sharedCards.map((x) => `${x.n} members share subscriber ID <span class="mono">${esc(x.s)}</span>.`).join(" ")}</p>` : ""}
    </div></details>
    <details id="more-decoys"><summary>Each test request <span class="hint">${caseIds.length} traps</span></summary><div class="inner"><div class="decoys">${decoys}</div></div></details>
    <details id="more-legend"><summary>What the results mean <span class="hint">${CATEGORIES.length} results</span></summary><div class="inner"><dl class="legend">${legend}</dl>
      <p style="font-size:0.88rem;color:var(--muted)">HRex says a plan returns at most one member, and refuses (HTTP 422) when there is no match, more than one match, or a consent it can’t honour. Any refusal where a refusal is due counts as right.</p></div></details>
  </div>

  <footer><span>Checked against the locked answer key <span class="mono">${esc(f.manifestDigest.slice(0, 12))}</span>. Generated by <span class="mono">npm run report</span>.</span>
    <span>Source: <a href="https://github.com/ImOnFHIR/member-match-decoy-lab">github.com/ImOnFHIR/member-match-decoy-lab</a> · Apache-2.0</span></footer>
</main>`;
  return o.fragment
    ? content + "\n"
    : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${content.replace("<main", "</head>\n<body>\n<main")}\n</body>\n</html>\n`;
}
