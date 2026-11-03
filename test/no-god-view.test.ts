import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Matchers and the endpoint must never see the answers: no manifest, no decoy cases, no expected outcomes.
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []);
const guarded = [...files("src/matchers"), "src/server.ts", "src/request.ts", "src/consent.ts", "src/population.ts", "src/fhir.ts"];

for (const f of guarded) {
  test(`no god view: ${f}`, () => {
    const t = readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    for (const banned of [/manifest/i, /ground-truth/i, /\.expected\b/, /\.cases\b/, /survivesIdMatch/]) assert.doesNotMatch(t, banned, `${f} references ${banned}`);
  });
}
