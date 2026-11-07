// Writes fixtures/requests/<case>.json from decoys/decoys.json (deterministic).
import { mkdirSync, writeFileSync } from "node:fs";
import { loadDecoys } from "../dist/src/decoys.js";
import { toMemberMatchParameters } from "../dist/src/converter.js";

const set = loadDecoys();
mkdirSync("fixtures/requests", { recursive: true });
for (const c of set.cases) {
  writeFileSync(
    `fixtures/requests/${c.id}.json`,
    JSON.stringify(toMemberMatchParameters(set, c), null, 2) + "\n",
  );
}
console.log(`wrote ${set.cases.length} requests to fixtures/requests/`);
