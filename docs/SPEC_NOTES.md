# Spec notes

What building against HRex 1.2.0 surfaced. The validator is HL7 `validator_cli` 7.0.4 with `-ig hl7.fhir.us.davinci-hrex#1.2.0 -tx n/a`.

1. **The consent policy URI fails validation, including in HRex's own example.** The HRex example `Parameters-member-match-in.json` fails with `No definition could be found for URL value '…hrex-consent.html#regular'`. The URI is a code in the required `hrex-consent-policy` ValueSet, so `scripts/validation-summary.mjs` allows exactly this message and nothing else. VERIFIED (2026-11-03).
2. **mm-6 and US Core pull in different directions.** mm-6 says `Consent.patient` SHALL be a local `Patient/<id>` resolving to MemberPatient, and `hrex-patient-demographics` doesn't require `Patient.identifier`. But `Consent.patient` is checked against US Core Patient 7.0.0, which does require an identifier. With no identifier, the validator reports `Unable to find a profile match for Patient/member`. The HRex example avoids this by using an absolute URL, which mm-6 forbids. This lab gives the patient the requesting plan's own synthetic member number. VERIFIED (2026-11-03).
3. **`Coverage.relationship` is required, but a card doesn't state it.** Following the HRex example, the converter sends `data-absent-reason#unknown`. That keeps D1 honest: relationship can't be used to tell Senior from Junior.
