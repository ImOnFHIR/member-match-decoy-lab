# Decoys

> **DRAFT, awaiting Nick's voice review.** Synthetic data only; not a production matching recommendation.

Every case is a synthetic `$member-match` request with a trap planted in it. The machine-readable source is [`decoys/decoys.json`](decoys/decoys.json), and `npm run decoys:lint` checks that each case has a trap and an expected outcome.

## Rules the expected answers rest on

The IG is Da Vinci HRex, published version v1.2.0. The quotes come from the HRex source, `HL7/davinci-ehrx` at commit `b5312b1` (2026-03-24), in `OperationDefinition-member-match-notes.md`. VERIFIED against that source. Before the release, re-check them against the published v1.2.0 page.

- **mm-8:** "A maximum of a SINGLE unique match **SHALL** be returned."
- **mm-9:** "No match **SHALL** return a 422 status code."
- **mm-10:** "Multiple matches **SHALL** return a 422 status code."
- **mm-11:** "If consent is provided, inability to comply with consent requirements **SHALL** return a 422 status code."
- **OperationDefinition description:** "Members implementing a deterministic match will require a match on member id or subscriber id at a minimum."

So a refusal (422) counts as a correct answer whenever the spec calls for one.

## The synthetic people

| id | Source | Name | DOB | Card |
|---|---|---|---|---|
| person-0001 | C-055 | John Roe | 1951-09-02 | SUB-1001 / MEM-1001-01 (self) |
| person-0002 | C-055 (the decoy) | Jon Roe | 1951-09-10 | SUB-1002 / MEM-1002-01 (self) |
| lab-0101 | new | Dana Quill | 1979-03-14 | SUB-2001 / MEM-2001-01 (self, subscriber) |
| lab-0102 | new | Rowan Quill | 2008-07-01 | SUB-2001 / MEM-2001-02 (child) |
| lab-0103 | new | Ada Quill | 2012-05-20 | SUB-2001 / MEM-2001-03 (child, twin) |
| lab-0104 | new | Aya Quill | 2012-05-20 | SUB-2001 / MEM-2001-04 (child, twin) |

All IDs carry a `SYN-` prefix in the data. Gender and every Quill person are additions for the lab: they aren't in C-055.

## Cases

| Case | Trap | Survives an ID match? | Correct answer |
|---|---|---|---|
| **D0-control** | None: clean card, clean demographics | No | Match, John (MEM-1001-01) |
| **D1-shared-subscriber** | Rowan's request carries only the family's subscriber ID. A matcher that stops at the ID returns Dana, the subscriber. | **Yes** | Match, Rowan (MEM-2001-02) |
| **D2-twins** | Ada and Aya share the subscriber ID, DOB, gender and surname, and the request gives only the initial "A". A scoring matcher picks one. | **Yes** | **422, multiple matches** (mm-10) |
| **D3-consent-expired** | John's clean request, but `Consent.provision.period` has ended. A matcher that ignores Consent returns a match. | No | **422, consent** (mm-11) |
| **D4-card-mixup** | John's demographics with Jon's valid member ID. An ID-first matcher returns Jon, the C-055 decoy. | **Yes** | **422, no match** (mm-9) |

**Decoy confusion** means that any case returns a member other than the expected one, or returns a match where a 422 was due. That is the error that sends records to the wrong person.

## Open for Nick (voice review)

1. **D1 is weak against a strict baseline.** The planned baseline goes identifier first, then name, DOB and gender, so it will probably get D1 right. D1 only catches matchers that stop at the ID. Keep it as is, or make it harder (for example a Sr./Jr. pair with the same first name on one card)?
2. **D3 uses an expired consent.** An alternative is a `#regular` (non-sensitive only) consent sent to a payer that can't segment sensitive data. That's more realistic, but it's a lab assumption rather than spec text. Expired, segmentation, or both?
3. **D4: is "no match" the right call?** Another reading is that the ID wins and the demographics are a typo. I've drafted mm-9 no-match, because a wrong release is worse than a refusal.
4. **New people.** The Quill family isn't in C-055. Is it OK to add them here only, with no change to care-continuum-lab?
5. **Shared-address case (C-055 person-0006) is left out of v0.** A generic shared-address decoy could come later.
