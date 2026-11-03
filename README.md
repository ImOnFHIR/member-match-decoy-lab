# member-match-decoy-lab

> **Synthetic data only; not a production matching recommendation.**

A lab for Da Vinci HRex `$member-match`. Each synthetic request carries a planted near-duplicate "decoy". Three matchers answer it, and a scorer counts what each one got right:

- an event-sourced matcher
- a simple deterministic baseline
- an LLM adjudicator

Status: v0 under construction (target 2026-12-02). Progress is in [REMAINING_WORK.md](REMAINING_WORK.md).

## Run

```sh
npm ci
npm test               # unit tests (node:test)
npm run decoys:lint    # every decoy has a trap and an expected outcome
npm run convert        # decoys -> fixtures/requests/*.json ($member-match input Parameters)
npm run validator:get  # one-time: fetch the HL7 validator (Java 17+)
npm run validate:fhir  # validate the requests against HRex 1.2.0
npm run leak:check     # leak guard; needs a banlist outside this repo (LEAK_GUARD_CONFIG)
```

- [DECOYS.md](DECOYS.md): the traps and their correct answers
- [docs/SPEC_NOTES.md](docs/SPEC_NOTES.md): what building against HRex turned up

## Licence

Apache-2.0. See [LICENSE](LICENSE).
