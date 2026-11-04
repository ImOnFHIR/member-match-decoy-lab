/** Node-only: load CoreData from the repo, after proving the answer key and every request match the lock. */
import { readFileSync } from "node:fs";
import { loadDecoys } from "../decoys.js";
import { lockedManifest } from "../run.js";
import { canonical, sha256 } from "../manifest.js";
import type { CoreData } from "./index.js";

export function loadCoreData(dir = "."): CoreData {
  const manifest = lockedManifest(dir); // throws ManifestLockError on any drift
  const decoys = loadDecoys(`${dir}/decoys/decoys.json`);
  const requests: Record<string, unknown> = {};
  for (const e of manifest.entries) {
    const r = JSON.parse(readFileSync(`${dir}/fixtures/requests/${e.case}.json`, "utf8"));
    if (sha256(canonical(r)) !== e.requestSha256) throw new Error(`fixtures/requests/${e.case}.json differs from the locked request`);
    requests[e.case] = r;
  }
  return { decoys, manifest, requests, lockDigest: sha256(canonical(manifest)) };
}
