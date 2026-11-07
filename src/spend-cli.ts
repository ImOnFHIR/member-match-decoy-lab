/**
 * npm run spend:check                 — this month's LLM spend vs the $50 ceiling; alert config present?
 * npm run spend:check -- --test-alert — also send a real test SMS (release audit: "spend alert tested end to end")
 * Exit 1 if spend is at/over the ceiling, if the alert line was crossed without a delivered alert,
 * or if the SMS alert is not configured (a ceiling with no alert is not a working ceiling).
 */
import { SpendGuard } from "./spend.js";
import { twilioSender, missingAlertEnv } from "./alert.js";

const guard = new SpendGuard({ alert: twilioSender() });
const s = guard.status();
const pct = (s.spentUsd / s.ceilingUsd) * 100;
console.log(
  `${s.month}: $${s.spentUsd.toFixed(4)} of $${s.ceilingUsd} (${pct.toFixed(1)}%), ${s.calls} calls; alert at $${s.alertUsd}${s.alerted ? " (sent)" : ""}`,
);

let bad = false;
const missing = missingAlertEnv();
if (missing.length) {
  console.error(`✗ SMS alert not configured: set ${missing.join(", ")}`);
  bad = true;
} else console.log("✓ SMS alert configured");
if (s.spentUsd >= s.ceilingUsd) {
  console.error("✗ at or over the ceiling: LLM runs are blocked");
  bad = true;
}
if (s.spentUsd >= s.alertUsd && !s.alerted) {
  console.error("✗ alert line crossed but no alert delivered");
  bad = true;
}

if (process.argv.includes("--test-alert")) {
  try {
    await guard.testAlert();
    console.log("✓ test SMS sent");
  } catch (e) {
    console.error(`✗ test SMS failed: ${(e as Error).message}`);
    bad = true;
  }
}
process.exit(bad ? 1 : 0);
