// The platform's public address for Telegram webhooks (pure; used by
// bot-tokens.server.ts). Telegram accepts only a public https:// URL.

/** PUBLIC_APP_URL as a webhook base: https only, no trailing slash. */
export function webhookBase(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^/\s]+$/.test(v) ? v : "https://salesiq.uz";
}
