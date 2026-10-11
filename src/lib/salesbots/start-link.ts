// The public start link of a salesbot: t.me/<platform bot>?start=sb_<bot id>.
// Anyone who opens it becomes a lead of the bot's company and the bot
// starts talking to them (telegram.webhook.ts). Pure helpers, shared by the
// server and the salesbot page.

const PREFIX = "sb_";

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

export function salesbotStartUrl(botUsername: string, botId: string): string {
  return `https://t.me/${botUsername}?start=${salesbotStartPayload(botId)}`;
}
