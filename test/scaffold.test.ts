import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SYNTHETIC_BANNER } from "../src/index.js";

test("LICENSE is Apache-2.0", () => {
  const text = readFileSync("LICENSE", "utf8");
  assert.match(text, /Apache License\s+Version 2\.0, January 2004/);
});

test("package.json declares Apache-2.0", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.license, "Apache-2.0");
});

test("synthetic banner is present", () => {
  assert.match(SYNTHETIC_BANNER, /synthetic/i);
});
