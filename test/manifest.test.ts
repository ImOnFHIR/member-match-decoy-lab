import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDecoys } from "../src/decoys.js";
import { buildManifest, manifestDigest, canonical } from "../src/manifest.js";

test("manifest: canonical JSON ignores key order", () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test("manifest: digest is stable across builds", () => {
  const set = loadDecoys();
  assert.equal(manifestDigest(buildManifest(set)), manifestDigest(buildManifest(loadDecoys())));
});

test("manifest: digest matches the committed lock", () => {
  const lock = readFileSync("manifest/ground-truth.sha256", "utf8").split(/\s+/)[0];
  assert.equal(manifestDigest(buildManifest(loadDecoys())), lock);
});

test("manifest: every 422 entry names no member; every match names one", () => {
  for (const e of buildManifest(loadDecoys()).entries) {
    if (e.outcome === "match") assert.ok(e.member && e.memberIdentifier, e.case);
    else assert.equal(e.member, null, e.case);
  }
});

// Tamper cases: run manifest:check in a copy of the repo; each must fail.
function checkIn(mutate: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  for (const p of ["manifest", "fixtures", "decoys", "dist", "package.json", "scripts"])
    cpSync(p, join(dir, p), { recursive: true });
  mutate(dir);
  return spawnSync(process.execPath, ["scripts/manifest.mjs", "check"], {
    cwd: dir,
    encoding: "utf8",
  });
}
const edit = (f: string, fn: (j: any) => void) => {
  const j = JSON.parse(readFileSync(f, "utf8"));
  fn(j);
  writeFileSync(f, JSON.stringify(j, null, 2));
};

test("manifest:check passes on an untouched copy", () => {
  const r = checkIn(() => {});
  assert.equal(r.status, 0, r.stderr);
});
test("manifest:check rejects an edited answer in ground-truth.json", () => {
  assert.notEqual(
    checkIn((d) =>
      edit(join(d, "manifest/ground-truth.json"), (j) => {
        j.entries[0].outcome = "no-match-422";
      }),
    ).status,
    0,
  );
});
test("manifest:check rejects an edited request fixture", () => {
  assert.notEqual(
    checkIn((d) =>
      edit(join(d, "fixtures/requests/D1-senior-junior.json"), (j) => {
        j.parameter[0].resource.birthDate = "1979-03-14";
      }),
    ).status,
    0,
  );
});
test("manifest:check rejects a changed expected outcome in decoys.json", () => {
  assert.notEqual(
    checkIn((d) =>
      edit(join(d, "decoys/decoys.json"), (j) => {
        j.cases[2].expected.outcome = "match";
      }),
    ).status,
    0,
  );
});
