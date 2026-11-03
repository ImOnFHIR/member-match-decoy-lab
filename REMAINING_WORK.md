# Remaining work

## 2026-11-03 session
Completed: 1 (scaffold, da68a19); 2 (decoys, reviewed by Nick by voice, eef5160); 3 (converter + HRex validation, ca757e9); leak guard ported (C-059); 4 (digest-locked ground-truth manifest)
Remaining: 5–11
Deviations: Repo is public from the first commit (Nick, 2026-11-03). `npm test -- <name>` filters test files by name through `scripts/test.mjs`. Lab adds synthetic Quill family and gender (not in C-055). C-059 leak guard ported with its banlist kept outside the repo (care-continuum-lab config plus ~/.config/member-match-decoy-lab/banlist.json); fails closed if none is found. Validator allows one known HRex false positive (docs/SPEC_NOTES.md #1). MemberPatient carries a synthetic new-plan identifier so Consent.patient meets US Core (SPEC_NOTES #2). Java: Homebrew openjdk@21; validator 7.0.4 in .tools/ (gitignored).
Test results: npm test 48/48 pass; manifest:check ✓ 6 entries, lock 59122badc0a3; validate:fhir 6/6 files 0 errors (6 known, 0 unknown); leak:check 0 violations; decoys:lint ✓ 6 cases, 3 survive an ID match; gitleaks clean.
Spend to date: $0 of $50
PENDING decisions: none (DECOYS.md 1–5 decided; SPEC_NOTES stays in repo for the video, Nick 2026-11-03). D3b's 'payer cannot segment sensitive data' is a declared lab assumption.
Nick hours this week: 0.3 of 1.75
