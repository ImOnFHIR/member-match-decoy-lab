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
npm test
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).
