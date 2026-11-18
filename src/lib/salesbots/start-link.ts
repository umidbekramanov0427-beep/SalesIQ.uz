// The public start link of a salesbot. Anyone who opens it becomes a lead of
// the bot's company and the bot starts talking to them (telegram.webhook.ts,
// telegram.org.$orgId.ts). Short form: t.me/<bot>?start=s_<6 letters>
// (salesbots.short_code); the long sb_<id> form still works. A company's own
// bot opens its main salesbot from the plain link t.me/<bot>. Pure helpers,
// shared by the server and the salesbot page.

const PREFIX = "sb_";
const SHORT_PREFIX = "s_";

/** Telegram start payloads allow 64 chars of [A-Za-z0-9_-]: the bot id without dashes fits. */
export function salesbotStartPayload(botId: string): string {
  return `${PREFIX}${botId.replace(/-/g, "")}`;
}

/** The bot id inside a "/start sb_..." message, or null. */
export function salesbotIdFromStart(text: string): string | null {
  const m = /^\/start\s+sb_([0-9a-f]{32})\b/i.exec(text.trim());
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The short code inside a "/start s_..." message, or null. */
export function salesbotCodeFromStart(text: string): string | null {
  const m = /^\/start\s+s_([0-9a-z]{4,12})\s*$/i.exec(text.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export function salesbotStartUrl(botUsername: string, botId: string): string {
  return `https://t.me/${botUsername}?start=${salesbotStartPayload(botId)}`;
}

/** The short link: t.me/<bot>?start=s_<code>, or just t.me/<bot> for the main salesbot. */
export function salesbotShortUrl(
  botUsername: string,
  shortCode: string | null,
  isMain = false,
): string | null {
  if (isMain) return `https://t.me/${botUsername}`;
  return shortCode ? `https://t.me/${botUsername}?start=${SHORT_PREFIX}${shortCode}` : null;
}
