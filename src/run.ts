/**
 * One scoreboard run: verify the ground-truth lock, start the local endpoint, POST every
 * request to every matcher over HTTP, score each answer. Shared by `npm run score` and the
 * MCP tool. Never reads decoy answers except through the locked manifest.
 */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { loadDecoys } from "./decoys.js";
import { roster } from "./population.js";
import { createEndpoint, type DecisionLog } from "./server.js";
import type { Matcher } from "./matchers/types.js";
import { buildManifest, manifestDigest, canonical, sha256, type Manifest } from "./manifest.js";
import { scoreOne, tally, type Answer, type Scoreboard } from "./scorer.js";

export class ManifestLockError extends Error {}

/** The committed manifest, after proving it matches its lock and a fresh rebuild. */
export function lockedManifest(dir = "."): Manifest {
  const lock = readFileSync(`${dir}/manifest/ground-truth.sha256`, "utf8").split(/\s+/)[0];
  const onDisk: Manifest = JSON.parse(readFileSync(`${dir}/manifest/ground-truth.json`, "utf8"));
  if (sha256(canonical(onDisk)) !== lock) throw new ManifestLockError("manifest/ground-truth.json does not match its lock");
  if (manifestDigest(buildManifest(loadDecoys(`${dir}/decoys/decoys.json`))) !== lock)
    throw new ManifestLockError("decoys or converter changed since the manifest was locked; run npm run manifest:check");
  return onDisk;
}

export interface RunOptions { matchers: Matcher[]; cases?: string[]; dir?: string; onDecision?: (d: DecisionLog) => void }

export async function runScoreboard(o: RunOptions): Promise<Scoreboard> {
  const dir = o.dir ?? ".";
  const manifest = lockedManifest(dir);
  const set = loadDecoys(`${dir}/decoys/decoys.json`);
  const entries = manifest.entries.filter((e) => !o.cases?.length || o.cases.includes(e.case));
  if (o.cases?.length && entries.length !== o.cases.length) throw new Error(`unknown case(s): ${o.cases.filter((c) => !entries.some((e) => e.case === c)).join(", ")}`);

  const server = createEndpoint({
    matchers: o.matchers,
    roster: roster(set),
    consent: { asOf: set.asOf, canSegmentSensitive: set.targetPayer.canSegmentSensitive },
    log: o.onDecision,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const rows = [];
    for (const m of o.matchers) {
      for (const e of entries) {
        const body = readFileSync(`${dir}/fixtures/requests/${e.case}.json`, "utf8");
        if (sha256(canonical(JSON.parse(body))) !== e.requestSha256) throw new ManifestLockError(`fixtures/requests/${e.case}.json differs from the locked request`);
        let a: Answer;
        try {
          const res = await fetch(`${base}/${m.name}/Patient/$member-match`, { method: "POST", headers: { "content-type": "application/fhir+json" }, body });
          a = { status: res.status, body: await res.json().catch(() => undefined) };
          if (res.status >= 500) a.error = a.body?.issue?.[0]?.diagnostics ?? `HTTP ${res.status}`;
        } catch (err) {
          a = { status: 0, error: (err as Error).message };
        }
        rows.push(scoreOne(m.name, e, a));
      }
    }
    return tally(rows, sha256(canonical(manifest)));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
