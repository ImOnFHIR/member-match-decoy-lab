import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lint = (file: string) =>
  spawnSync(process.execPath, ["scripts/decoys-lint.mjs", file, "DECOYS.md"], { encoding: "utf8" });

test("decoys:lint passes on the decoy set", () => {
  const r = lint("decoys/decoys.json");
  assert.equal(r.status, 0, r.stderr);
});

// Every invalid variant must fail (C-056 pattern).
const base = JSON.parse(readFileSync("decoys/decoys.json", "utf8"));
const invalid: Record<string, (d: any) => void> = {
  "missing trap": (d) => { d.cases[1].trap = ""; },
  "unknown outcome": (d) => { d.cases[1].expected.outcome = "maybe"; },
  "match without member": (d) => { delete d.cases[0].expected.member; },
  "memberIdentifier of someone else": (d) => { d.cases[1].expected.memberIdentifier = "SYN-MEM-2001-01"; },
  "422 naming a member": (d) => { d.cases[2].expected.member = "lab-0103"; },
  "no ID-surviving decoy": (d) => { for (const c of d.cases) c.survivesIdMatch = false; },
  "card with no identifier": (d) => { d.cases[0].request.card = {}; },
};
const dir = mkdtempSync(join(tmpdir(), "decoys-"));
for (const [name, mutate] of Object.entries(invalid)) {
  test(`decoys:lint rejects: ${name}`, () => {
    const d = structuredClone(base);
    mutate(d);
    const f = join(dir, name.replace(/\W+/g, "-") + ".invalid.json");
    writeFileSync(f, JSON.stringify(d));
    assert.notEqual(lint(f).status, 0);
  });
}
