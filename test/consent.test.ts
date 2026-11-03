import { test } from "node:test";
import assert from "node:assert/strict";
import { consentGate } from "../src/consent.js";
import { POLICY } from "../src/converter.js";

const ctx = { asOf: "2026-11-01", canSegmentSensitive: false };
const req = (consent?: any) => ({ given: "A", family: "B", ...(consent ? { consent } : {}) });
const period = { start: "2026-10-01", end: "2027-09-30" };

test("consent: absent consent passes (mm-11 applies only if consent is provided)", () => assert.equal(consentGate(req(), ctx).ok, true));
test("consent: current #sensitive passes", () => assert.equal(consentGate(req({ policy: [POLICY.sensitive], period, status: "active" }), ctx).ok, true));
test("consent: expired fails", () => assert.equal(consentGate(req({ policy: [POLICY.sensitive], period: { start: "2025-01-01", end: "2025-12-31" } }), ctx).ok, false));
test("consent: not yet started fails", () => assert.equal(consentGate(req({ policy: [POLICY.sensitive], period: { start: "2026-12-01", end: "2027-01-01" } }), ctx).ok, false));
test("consent: #regular fails when the payer cannot segment", () => assert.equal(consentGate(req({ policy: [POLICY.regular], period }), ctx).ok, false));
test("consent: #regular passes when the payer can segment", () => assert.equal(consentGate(req({ policy: [POLICY.regular], period }), { ...ctx, canSegmentSensitive: true }).ok, true));
test("consent: inactive status fails", () => assert.equal(consentGate(req({ policy: [POLICY.sensitive], period, status: "inactive" }), ctx).ok, false));
test("consent: unknown policy fails", () => assert.equal(consentGate(req({ policy: ["urn:x"], period }), ctx).ok, false));
