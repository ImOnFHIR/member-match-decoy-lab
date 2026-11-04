/**
 * Spend alerts by SMS through Twilio's REST API (the same provider as C-028, Nick's SMS runtime).
 * Credentials come only from the environment, never from a file in this repo:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SPEND_ALERT_SMS_TO
 */
export interface AlertSender { send(text: string): Promise<void> }

const REQUIRED = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "SPEND_ALERT_SMS_TO"] as const;

export function missingAlertEnv(env: Record<string, string | undefined> = process.env): string[] {
  return REQUIRED.filter((k) => !env[k]);
}

export function twilioSender(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): AlertSender {
  return {
    async send(text) {
      const missing = missingAlertEnv(env);
      if (missing.length) throw new Error(`SMS alert not configured: set ${missing.join(", ")}`);
      const sid = env.TWILIO_ACCOUNT_SID!;
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: "Basic " + Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64"),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: env.SPEND_ALERT_SMS_TO!, From: env.TWILIO_FROM_NUMBER!, Body: text }),
      });
      if (!res.ok) {
        // Twilio's error JSON carries a code and message; never echo request headers.
        let detail = "";
        try { const j: any = await res.json(); detail = `${j.code ?? ""} ${j.message ?? ""}`.trim(); } catch { /* ignore */ }
        throw new Error(`Twilio SMS failed: HTTP ${res.status} ${detail}`);
      }
    },
  };
}
