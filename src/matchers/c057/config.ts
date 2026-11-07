// Ported from care-continuum-lab pocs/identity-service/src/config.mjs @ 7422a34 (see PROVENANCE.md).
/** Synthetic study thresholds — declared, not clinically reviewed. */
export const THRESHOLDS = {
  probable: 0.75, // at/above: a probabilistic comparison is a candidate
  autoConfirmStandard: 0.9, // standard profile only: at/above this, a sole candidate confirms
} as const;
export const WEIGHTS = { name: 0.6, birthDate: 0.4 } as const;
export type ThresholdProfile = "standard" | "conservative";
