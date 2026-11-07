// manifest:build writes manifest/ground-truth.json + .sha256.
// manifest:check rebuilds twice, requires identical digests, and requires them to equal the
// committed digest and file. Any change to an answer or a request fails until re-locked.
import { readFileSync, writeFileSync } from "node:fs";
import { loadDecoys } from "../dist/src/decoys.js";
import { buildManifest, manifestDigest, canonical, sha256 } from "../dist/src/manifest.js";

const FILE = "manifest/ground-truth.json";
const LOCK = "manifest/ground-truth.sha256";
const mode = process.argv[2];

const a = buildManifest(loadDecoys());
const b = buildManifest(loadDecoys());
const d = manifestDigest(a);
if (d !== manifestDigest(b)) {
  console.error("✗ manifest is not deterministic");
  process.exit(1);
}

if (mode === "build") {
  writeFileSync(FILE, JSON.stringify(a, null, 2) + "\n");
  writeFileSync(LOCK, `${d}  ${FILE}\n`);
  console.log(`locked ${a.entries.length} entries: ${d}`);
  process.exit(0);
}

const lock = readFileSync(LOCK, "utf8").split(/\s+/)[0];
const onDisk = JSON.parse(readFileSync(FILE, "utf8"));
const diskDigest = sha256(canonical(onDisk));
const fails = [];
if (diskDigest !== lock)
  fails.push(`${FILE} was edited (digest ${diskDigest.slice(0, 12)} ≠ lock ${lock.slice(0, 12)})`);
if (d !== lock)
  fails.push(
    `decoys or converter changed the ground truth (rebuilt ${d.slice(0, 12)} ≠ lock ${lock.slice(0, 12)}); review, then npm run manifest:build`,
  );
for (const e of a.entries) {
  try {
    const f = JSON.parse(readFileSync(`fixtures/requests/${e.case}.json`, "utf8"));
    if (sha256(canonical(f)) !== e.requestSha256)
      fails.push(`fixtures/requests/${e.case}.json differs from the locked request`);
  } catch {
    fails.push(`missing fixtures/requests/${e.case}.json`);
  }
}
if (fails.length) {
  console.error(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log(`✓ manifest locked and stable: ${a.entries.length} entries, ${d}`);
