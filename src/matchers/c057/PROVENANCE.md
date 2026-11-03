# Provenance: matcher A (C-057)

Ported from `ImOnFHIR/care-continuum-lab`, `pocs/identity-service/` at commit `7422a34` (2026-08-26). That's Nick's event-sourced identity service. The copy into this repo was approved in the build brief.

| Here | There | Change |
|---|---|---|
| `compare.ts` | `src/matcher.mjs` | Levenshtein name similarity, the 30-day DOB window and the deterministic-key order are unchanged. The address bonus and its facility registry are **removed**: `$member-match` requests here carry no address, so it would never fire. `governmentId` and `beneficiaryId` keys stay in the code but nothing populates them, because a member-match card has neither. |
| `config.ts` | `src/config.mjs` | `THRESHOLDS` and the name/DOB `WEIGHTS` are unchanged. `addressBonus` is removed along with the address bonus. |
| `decide.ts` | `src/core.mjs`, `matchPipeline()` | The same branches in the same order: a deterministic key with fully conflicted demographics goes to review; a deterministic key matches; two or more probable candidates are ambiguous; one probable candidate auto-confirms only under the `standard` profile at ≥ 0.90, otherwise goes to review; no candidates mints a new identity. |

**What isn't ported:** the event store, the contract-validated events, merge/unmerge, and the purpose gate. A `$member-match` call is one stateless decision, so only the match decision is exercised. A minted identity, or one sent to review, can't be returned as a unique match, so it maps to a 422.

**Lab settings, not from C-057:**
- The target payer uses the `standard` threshold profile, the more permissive of C-057's two.
- `Coverage.identifier` of type MB maps to C-057's `memberId` key.
- `Coverage.subscriberId` maps to nothing: C-057 has no subscriber-ID key.
