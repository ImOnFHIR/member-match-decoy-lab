/**
 * API spend guard for the LLM arm. Ceiling $50/month per build, alert at 80% ($40)
 * (Nick, 2026-11-03). Checked BEFORE every call against a worst-case estimate, so a call that
 * could cross the ceiling is never sent. Ledger: .spend/ledger.jsonl (gitignored, local).
 *
 * Fail closed: once spend reaches the alert line, further calls are blocked until the alert
 * has actually been delivered. A silent alert is treated as no alert.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AlertSender } from "./alert.js";

/** USD per million tokens (Anthropic first-party list prices, checked 2026-11-03). */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function priceOf(model: string) {
  const p = PRICES[model];
  if (!p) throw new Error(`no price for model ${model}; add it to PRICES before running it`);
  return p;
}

export function costUsd(model: string, u: Usage): number {
  const p = priceOf(model);
  return (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead
    + (u.cache_creation_input_tokens ?? 0) * p.input * CACHE_WRITE_MULTIPLIER) / 1e6;
}

/** Worst case for one call: estimated input at ~3 chars/token (generous), plus the full max_tokens of output. */
export function worstCaseUsd(model: string, promptChars: number, maxTokens: number): number {
  return costUsd(model, { input_tokens: Math.ceil(promptChars / 3), output_tokens: maxTokens });
}

type Entry =
  | { type: "call"; at: string; month: string; model: string; servedBy?: string; usd: number; usage: Usage; label: string }
  | { type: "alert"; at: string; month: string; usd: number };

export class SpendCeilingError extends Error {}

export interface SpendGuardOptions {
  ledgerPath?: string;
  ceilingUsd?: number;
  alertFraction?: number;
  alert: AlertSender;
  now?: () => Date;
}

export class SpendGuard {
  readonly ledgerPath: string;
  readonly ceilingUsd: number;
  readonly alertUsd: number;
  private alert: AlertSender;
  private now: () => Date;

  constructor(o: SpendGuardOptions) {
    this.ledgerPath = o.ledgerPath ?? ".spend/ledger.jsonl";
    this.ceilingUsd = o.ceilingUsd ?? 50;
    this.alertUsd = this.ceilingUsd * (o.alertFraction ?? 0.8);
    this.alert = o.alert;
    this.now = o.now ?? (() => new Date());
  }

  private month() { return this.now().toISOString().slice(0, 7); }

  private entries(): Entry[] {
    if (!existsSync(this.ledgerPath)) return [];
    return readFileSync(this.ledgerPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  private append(e: Entry) {
    mkdirSync(dirname(this.ledgerPath), { recursive: true });
    appendFileSync(this.ledgerPath, JSON.stringify(e) + "\n");
  }

  status() {
    const m = this.month();
    const es = this.entries().filter((e) => e.month === m);
    const calls = es.filter((e): e is Extract<Entry, { type: "call" }> => e.type === "call");
    const spent = calls.reduce((s, e) => s + e.usd, 0);
    return { month: m, spentUsd: spent, ceilingUsd: this.ceilingUsd, alertUsd: this.alertUsd, alerted: es.some((e) => e.type === "alert"), calls: calls.length };
  }

  /** Call before every API request. Throws SpendCeilingError if the call must not be sent. */
  async beforeCall(worstCase: number): Promise<void> {
    const s = this.status();
    if (s.spentUsd >= this.alertUsd && !s.alerted) await this.sendAlert(s.spentUsd); // throws if undeliverable: fail closed
    if (s.spentUsd + worstCase > this.ceilingUsd)
      throw new SpendCeilingError(`blocked: $${s.spentUsd.toFixed(4)} spent in ${s.month} + worst case $${worstCase.toFixed(4)} would exceed the $${this.ceilingUsd} ceiling`);
  }

  /** Call after every API response with the real usage. Sends the 80% alert when the line is crossed. */
  async afterCall(model: string, usage: Usage, label: string, servedBy?: string): Promise<number> {
    const usd = costUsd(servedBy && PRICES[servedBy] ? servedBy : model, usage);
    this.append({ type: "call", at: this.now().toISOString(), month: this.month(), model, ...(servedBy && servedBy !== model ? { servedBy } : {}), usd, usage, label });
    const s = this.status();
    if (s.spentUsd >= this.alertUsd && !s.alerted) await this.sendAlert(s.spentUsd);
    return usd;
  }

  /** Sends the alert text now (used by spend:check --test-alert). Does not mark the month as alerted. */
  async testAlert(): Promise<void> {
    const s = this.status();
    await this.alert.send(`member-match-decoy-lab TEST alert: LLM spend $${s.spentUsd.toFixed(2)} of $${this.ceilingUsd} this month. The real alert fires at $${this.alertUsd}.`);
  }

  private async sendAlert(spent: number) {
    await this.alert.send(`member-match-decoy-lab: LLM spend $${spent.toFixed(2)} of $${this.ceilingUsd} this month (alert at $${this.alertUsd}). Runs stop at the ceiling.`);
    this.append({ type: "alert", at: this.now().toISOString(), month: this.month(), usd: spent });
  }
}
