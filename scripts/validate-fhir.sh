#!/usr/bin/env bash
# Validate every generated request against HRex 1.2.0 with the official HL7 validator.
# Fails if any file has an error. Needs Java 17+ and .tools/validator_cli.jar (npm run validator:get).
set -euo pipefail
# macOS ships a /usr/bin/java stub that fails without a JDK, so test that java actually runs.
if [ -z "${JAVA:-}" ]; then
  for j in "$(brew --prefix openjdk@21 2>/dev/null)/bin/java" "$(command -v java || true)"; do
    if [ -x "$j" ] && "$j" -version >/dev/null 2>&1; then JAVA="$j"; break; fi
  done
fi
[ -n "${JAVA:-}" ] || { echo "no working Java 17+ found (set JAVA=...)" >&2; exit 2; }
JAR=.tools/validator_cli.jar
[ -f "$JAR" ] || { echo "missing $JAR — run: npm run validator:get" >&2; exit 2; }
mkdir -p .tools/out
"$JAVA" -jar "$JAR" fixtures/requests/*.json -version 4.0.1 \
  -ig hl7.fhir.us.davinci-hrex#1.2.0 -tx n/a -output .tools/out/validation.json > .tools/out/validation.log 2>&1 || true
[ -f .tools/out/validation.json ] || { tail -20 .tools/out/validation.log >&2; exit 2; }
node scripts/validation-summary.mjs .tools/out/validation.json
