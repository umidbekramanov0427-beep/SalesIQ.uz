// Sign-in confirmation code (Platforma → Sozlamalar → Xavfsizlik): the
// rules shared by the server and the code screen. Pure, so it is unit-tested.

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 5;

export type CodeChannel = "email" | "telegram";

/** Where the code goes: email when the platform can send mail, else the linked Telegram, else nowhere (the code is then not asked, so nobody is locked out). */
export function pickChannel(p: {
  smtpReady: boolean;
  email: string | null;
  telegramChatId: string | number | null;
}): CodeChannel | null {
  if (p.smtpReady && p.email && /@/.test(p.email)) return "email";
  if (p.telegramChatId != null && String(p.telegramChatId) !== "") return "telegram";
  return null;
}

/** a***@gmail.com -- enough to recognise, not to read. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name[0]}${"*".repeat(Math.max(2, Math.min(5, name.length - 1)))}@${domain}`;
}

/** Seconds until the code can be sent again (0 = now). */
export function resendWait(sentAt: string | null, now: number = Date.now()): number {
  if (!sentAt) return 0;
  const left = Date.parse(sentAt) + RESEND_AFTER_MS - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** A 6-digit code from a random 32-bit number (no leading-zero loss). */
export function formatCode(n: number): string {
  return String(Math.abs(Math.trunc(n)) % 1_000_000).padStart(6, "0");
}
