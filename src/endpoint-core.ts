/**
 * The $member-match decision for one request, with no HTTP: parse → matcher → 200 Parameters | 422 OperationOutcome.
 * Node-free: the local endpoint (src/server.ts) and the browser core (src/core) both use it.
 */
import type { Matcher } from "./matchers/types.js";
import type { Member } from "./population.js";
import { parseRequest, BadRequest } from "./request.js";
import type { ConsentContext } from "./consent.js";
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
  const d = await m.decide(req, opts.roster, opts.consent);
  if (d.kind === "match") {
    if (!opts.roster.some((r) => r.memberId === d.memberId)) throw new Error(`${m.name} returned a member not on the roster`);
    return { status: 200, body: matchResponse(d.memberId), log: { matcher: m.name, status: 200, memberId: d.memberId, rationale: d.rationale } };
  }
  return { status: 422, body: refusal(d.reason, d.rationale), log: { matcher: m.name, status: 422, reason: d.reason, rationale: d.rationale } };
}
