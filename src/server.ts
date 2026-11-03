/**
 * Local $member-match endpoint. Loopback only, no auth, synthetic data only.
 *   POST /<matcher>/Patient/$member-match   (also /<matcher>/$member-match)
 * Order per request: parse → HRex consent gate (mm-11) → matcher → 200 Parameters | 422 OperationOutcome.
 * Every decision is logged with its rationale.
 */
import { createServer, type Server } from "node:http";
import type { Matcher } from "./matchers/types.js";
import type { Member } from "./population.js";
import { parseRequest, BadRequest } from "./request.js";
import { consentGate, type ConsentContext } from "./consent.js";
import { matchResponse, refusal } from "./fhir.js";

export interface DecisionLog { matcher: string; status: number; reason?: string; memberId?: string; rationale: string }

export interface EndpointOptions {
  matchers: Matcher[];
  roster: Member[];
  consent: ConsentContext;
  log?: (entry: DecisionLog) => void;
  maxBodyBytes?: number;
}

export async function handle(opts: EndpointOptions, matcherName: string, body: unknown): Promise<{ status: number; body: unknown; log: DecisionLog }> {
  const m = opts.matchers.find((x) => x.name === matcherName);
  if (!m) return { status: 404, body: refusal("bad-request", `unknown matcher ${matcherName}`), log: { matcher: matcherName, status: 404, rationale: "unknown matcher" } };
  let req;
  try {
    req = parseRequest(body);
  } catch (e) {
    if (!(e instanceof BadRequest)) throw e;
    return { status: 400, body: refusal("bad-request", e.message), log: { matcher: m.name, status: 400, reason: "bad-request", rationale: e.message } };
  }
  const gate = consentGate(req, opts.consent);
  if (!gate.ok) return { status: 422, body: refusal("consent", gate.reason), log: { matcher: m.name, status: 422, reason: "consent", rationale: `endpoint consent gate: ${gate.reason}` } };
  const d = await m.decide(req, opts.roster);
  if (d.kind === "match") {
    if (!opts.roster.some((r) => r.memberId === d.memberId)) throw new Error(`${m.name} returned a member not on the roster`);
    return { status: 200, body: matchResponse(d.memberId), log: { matcher: m.name, status: 200, memberId: d.memberId, rationale: d.rationale } };
  }
  return { status: 422, body: refusal(d.reason, d.rationale), log: { matcher: m.name, status: 422, reason: d.reason, rationale: d.rationale } };
}

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
