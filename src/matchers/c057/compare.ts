// Ported from care-continuum-lab pocs/identity-service/src/matcher.mjs @ 7422a34 (see PROVENANCE.md).
// The matcher, study-grade and declared so. Address bonus removed: requests here carry no address.
import { WEIGHTS } from "./config.js";

export interface Facet { name: string; birthDate?: string; memberId?: string; governmentId?: string; beneficiaryId?: string }
export interface Identity { id: string; attributes: Facet[] }
export interface Comparison { deterministic: "beneficiaryId" | "governmentId" | "memberId" | null; score: number; agreed: string[]; conflicted: string[] }

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
export const nameSim = (a?: string, b?: string) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
};
export const dobSim = (a?: string, b?: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const days = Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  return Math.max(0, 1 - days / 30);
};

export function compare(record: Facet, identity: Identity): Comparison {
  let deterministic: Comparison["deterministic"] = null;
  const agreed: string[] = [], conflicted: string[] = [];
  let best = 0;
  for (const f of identity.attributes) {
    if (record.beneficiaryId && f.beneficiaryId && record.beneficiaryId === f.beneficiaryId) deterministic = "beneficiaryId";
    if (record.governmentId && f.governmentId && record.governmentId === f.governmentId) deterministic ??= "governmentId";
    if (record.memberId && f.memberId && record.memberId === f.memberId) deterministic ??= "memberId";
    const s = Math.min(1, nameSim(record.name, f.name) * WEIGHTS.name + dobSim(record.birthDate, f.birthDate) * WEIGHTS.birthDate);
    if (s > best) best = s;
  }
  const bestFacet = identity.attributes.reduce<{ s: number; f: Facet | null }>((acc, f) => {
    const s = nameSim(record.name, f.name) * 0.6 + dobSim(record.birthDate, f.birthDate) * 0.4;
    return s > acc.s ? { s, f } : acc;
  }, { s: -1, f: null }).f;
  if (bestFacet) {
    for (const [attr, sim] of [["name", nameSim(record.name, bestFacet.name)], ["birthDate", dobSim(record.birthDate, bestFacet.birthDate)]] as const) {
      (sim >= 0.95 ? agreed : conflicted).push(attr);
    }
    if (record.beneficiaryId && bestFacet.beneficiaryId && record.beneficiaryId !== bestFacet.beneficiaryId) conflicted.push("beneficiaryId");
    if (deterministic) agreed.unshift(deterministic);
  }
  return { deterministic, score: Math.round(best * 100) / 100, agreed, conflicted };
}
