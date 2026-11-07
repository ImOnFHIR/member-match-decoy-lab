// Summarise validator output (a Bundle of OperationOutcomes, or one OperationOutcome). Exit 1 on any error/fatal.
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
const oos = r.resourceType === "Bundle" ? r.entry.map((e) => e.resource) : [r];
// Known false positives, matched exactly. Each needs evidence that it is not ours.
const KNOWN = [
  {
    re: /^No definition could be found for URL value 'http:\/\/hl7\.org\/fhir\/us\/davinci-hrex\/StructureDefinition-hrex-consent\.html#(regular|sensitive)'$/,
    why: "HRex 1.2.0's own example Parameters-member-match-in.json fails with the same error under validator 7.0.4; the URI is a code in the required hrex-consent-policy ValueSet, not a resolvable canonical.",
  },
];
const known = (i) => KNOWN.find((k) => k.re.test(i.details?.text ?? i.diagnostics ?? ""));
let bad = 0;
let knownCount = 0;
for (const oo of oos) {
  const file =
    oo.extension?.find((x) => x.url.endsWith("operationoutcome-file"))?.valueString ?? "?";
  const issues = oo.issue ?? [];
  const all = issues.filter((i) => i.severity === "error" || i.severity === "fatal");
  const errs = all.filter((i) => !known(i));
  knownCount += all.length - errs.length;
  const warns = issues.filter((i) => i.severity === "warning");
  bad += errs.length;
  console.log(
    `${errs.length ? "✗" : "✓"} ${file.split("/").pop()}: ${errs.length} errors, ${all.length - errs.length} known, ${warns.length} warnings`,
  );
  if (process.env.VERBOSE)
    for (const i of warns) console.log(`    warning: ${i.details?.text ?? i.diagnostics}`);
  for (const i of errs)
    console.log(
      `    ${i.severity}: ${i.details?.text ?? i.diagnostics} @ ${(i.expression ?? i.location ?? []).join(",")}`,
    );
}
if (knownCount)
  console.log(
    `${knownCount} known false positive(s) allowed:\n${KNOWN.map((k) => "  - " + k.why).join("\n")}`,
  );
process.exit(bad ? 1 : 0);
