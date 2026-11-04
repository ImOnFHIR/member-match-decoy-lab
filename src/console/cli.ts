/**
 * npm run console — start the dev console on 127.0.0.1 and print its link.
 * PORT (default 4317). Servers come from console.config.json and console.local.json.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadConsoleConfig } from "./config.js";
import { Hub } from "./hub.js";
import { createConsoleServer } from "./http.js";

const PAGE = "dist/ui/console.html";
const port = Number(process.env.PORT ?? 4317);
const token = randomBytes(18).toString("base64url");
const hub = new Hub(loadConsoleConfig("."));
await hub.startAll();
const server = createConsoleServer({ hub, token, page: () => readFileSync(PAGE, "utf8") });
server.listen(port, "127.0.0.1", () => {
  console.log("ImOnFHIR dev console (local only)\n");
  for (const s of hub.overview()) console.log(`  ${s.status === "ready" ? "●" : "○"} ${s.label}: ${s.status === "ready" ? `${s.tools.length} tool(s)` : s.error}`);
  console.log(`\nOpen: http://127.0.0.1:${port}/#token=${token}\nStop: Ctrl+C`);
});
const shutdown = async () => { server.close(); await hub.stopAll(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
