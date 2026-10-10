import crypto from "node:crypto";

// Telegram Mini App launch data (window.Telegram.WebApp.initData) is a
// query string signed by Telegram with the bot's token. Validating it is
// what makes "this request comes from Telegram user X" trustworthy -- the
// Mini App runs in a webview anyone could imitate, so nothing in it is
// believed until this check passes.
//
//   secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   hash       = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
//
// data_check_string is every field except `hash`, sorted by key, joined as
// "key=value" with "\n". https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type ValidInitData = {
  user: TelegramWebAppUser;
  authDate: Date;
  startParam: string | null;
};

/** Launch data older than this is refused (a leaked initData is not a long-lived key). */
const MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = MAX_AGE_SECONDS,
): ValidInitData | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (
    !crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash.toLowerCase(), "hex"))
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  let user: TelegramWebAppUser | null = null;
  try {
    const raw = JSON.parse(params.get("user") ?? "null") as TelegramWebAppUser | null;
    if (raw && typeof raw.id === "number") user = raw;
  } catch {
    user = null;
  }
  if (!user) return null;

  return { user, authDate: new Date(authDate * 1000), startParam: params.get("start_param") };
}

export function telegramDisplayName(u: { first_name?: string; last_name?: string }): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
}
