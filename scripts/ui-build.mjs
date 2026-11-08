// npm run ui:build — the in-Claude view (MCP Apps) as one self-contained file: dist/ui/view.html.
// The host's default CSP allows only inline script and style, no network and no web fonts.
// The dev console page now ships with the mcp-tool-console package.
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { TOKENS, VIEW_CSS } from "mcp-tool-console/styles";

const v = await build({
  entryPoints: ["src/ui/browser/view-main.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  minify: true,
  logLevel: "error",
});
const vjs = v.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const viewHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Member-match decoy test</title>
<style>${TOKENS}${VIEW_CSS}
html, body { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.5 var(--body); }
#root { padding: 12px 16px; }
</style></head>
<body><div id="root"><p class="tv-note">Waiting for the result…</p></div>
<script type="module">${vjs}</script>
</body></html>
`;
mkdirSync("dist/ui", { recursive: true });
writeFileSync("dist/ui/view.html", viewHtml);
console.log(`dist/ui/view.html (${Math.round(viewHtml.length / 1024)} KB)`);
