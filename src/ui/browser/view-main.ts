/**
 * The in-Claude view (MCP Apps): shows a tool result as the same card the console shows.
 * Uses the result's _meta view; if a host drops _meta, rebuilds the card from structuredContent.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { renderView, esc } from "../render.js";
import { checkView, type ToolView } from "../view.js";
import { toView } from "../../report-view.js";

const root = document.getElementById("root")!;
const app = new App({ name: "member-match-decoy-lab view", version: "0.1.0" }, {}, { autoResize: true });
let lastArgs: Record<string, unknown> = {};

function viewOf(result: any): ToolView {
  const v = result?._meta?.["com.imonfhir/view"];
  if (v && checkView(v).length === 0) return v;
  const sc = result?.structuredContent;
  if (sc?.matchers && sc?.rows) { try { return toView(sc); } catch { /* fall through */ } }
  const text = (result?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  return { v: 1, status: result?.isError ? "error" : "info", headline: text.split("\n")[0] || "Done." };
}

function show(result: any) {
  root.innerHTML = renderView(viewOf(result), { withNext: true });
  root.querySelectorAll<HTMLButtonElement>("[data-patch]").forEach((b) => b.addEventListener("click", async () => {
    const args = { ...lastArgs, ...JSON.parse(b.dataset.patch!) };
    root.setAttribute("aria-busy", "true");
    try { lastArgs = args; show(await app.callServerTool({ name: "score_member_match", arguments: args })); }
    catch (e) { root.insertAdjacentHTML("afterbegin", `<p class="tv-error">${esc((e as Error).message)}</p>`); }
    finally { root.removeAttribute("aria-busy"); }
  }));
}

function theme() {
  const t = app.getHostContext()?.theme;
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
}

app.ontoolinput = (p: any) => { lastArgs = p?.arguments ?? {}; root.innerHTML = `<p class="tv-note">Running the decoy test…</p>`; };
app.ontoolresult = (p: any) => show(p);
app.onhostcontextchanged = () => theme();
await app.connect();
theme();
