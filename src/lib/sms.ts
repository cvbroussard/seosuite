/**
 * SMS service via Twilio.
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

const SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_PHONE_NUMBER;

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!SID || !AUTH || !FROM) {
    console.log(`[SMS] To: ${to} | Body: ${body}`);
    return true;
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${SID}:${AUTH}`).toString("base64")}`,
      },
      body: new URLSearchParams({ To: to, From: FROM, Body: body }).toString(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Twilio error:", res.status, err);
    }
    return res.ok;
  } catch (err) {
    console.error("SMS send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
