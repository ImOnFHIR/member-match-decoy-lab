/**
 * Local $member-match endpoint. Loopback only, no auth, synthetic data only.
 *   POST /<matcher>/Patient/$member-match   (also /<matcher>/$member-match)
 * Order per request: parse → matcher → 200 Parameters | 422 OperationOutcome.
 * Consent (HRex mm-11) is each matcher's job, not the endpoint's (Nick, 2026-11-03).
 * Every decision is logged with its rationale.
 */
import { createServer, type Server } from "node:http";
import { refusal } from "./fhir.js";

export { handle, type DecisionLog, type EndpointOptions } from "./endpoint-core.js";
import { handle, type EndpointOptions } from "./endpoint-core.js";

const ROUTE = /^\/([a-z0-9-]+)\/(?:Patient\/)?\$member-match$/;

export function createEndpoint(opts: EndpointOptions): Server {
  const max = opts.maxBodyBytes ?? 256 * 1024;
  return createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/fhir+json" });
      res.end(JSON.stringify(body));
    };
    const route = ROUTE.exec(req.url ?? "");
    if (req.method !== "POST" || !route) return send(404, refusal("bad-request", "POST /<matcher>/Patient/$member-match"));
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) { send(413, refusal("bad-request", "body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", async () => {
      if (res.headersSent) return;
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(400, refusal("bad-request", "body is not JSON")); }
      try {
        const out = await handle(opts, route[1], body);
        opts.log?.(out.log);
        send(out.status, out.body);
      } catch (e) {
        send(500, { resourceType: "OperationOutcome", issue: [{ severity: "fatal", code: "exception", diagnostics: String((e as Error).message) }] });
      }
    });
  });
}
