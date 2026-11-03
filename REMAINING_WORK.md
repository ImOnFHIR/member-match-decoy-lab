# Remaining work

## 2026-11-03 session
Completed: 1 (scaffold, da68a19); 2 drafted (DECOYS.md + decoys/decoys.json + decoys:lint), awaiting Nick's voice review
Remaining: 2 (Nick review), 3–11
Deviations: Repo is public from the first commit (Nick, 2026-11-03). `npm test -- <name>` filters test files by name through `scripts/test.mjs`. Lab adds synthetic Quill family and gender (not in C-055). C-059 leak guard not yet ported: its banlist config must not be copied into this public repo; port the code with an HMAC-only or out-of-repo banlist before task 3 fixtures land.
Test results: npm test 11/11 pass; decoys:lint ✓ 5 cases, 3 survive an ID match; gitleaks clean.
Spend to date: $0 of $50
PENDING decisions: DECOYS.md questions 1–5
Nick hours this week: 0.1 of 1.75
