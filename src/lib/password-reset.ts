// Password reset through Telegram (login page -> "Parolni unutdingizmi?"):
// the platform bot sends a 6-digit code to the person's linked Telegram,
// they type it with a new password, and are signed in. The rules live
// here, pure and unit-tested; password-reset.server.ts does the work.
import { phoneKey } from "@/lib/phone-key";

/** A code is good for this long. */
export const CODE_TTL_MIN = 10;
/** Wrong guesses one code allows. */
export const MAX_TRIES = 5;
/** Codes one person can ask for in an hour. */
export const MAX_CODES_PER_HOUR = 3;
/** Code requests one address (IP) can make in an hour. */
export const MAX_REQUESTS_PER_IP_HOUR = 10;
/** Seconds before "send again" is offered. */
export const RESEND_AFTER_SEC = 60;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Login = { kind: "email"; email: string } | { kind: "phone"; key: string };

/** What the person typed: their e-mail, or their phone number in any format. */
export function parseLogin(raw: string): Login | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes("@")) return EMAIL_RE.test(v) ? { kind: "email", email: v.toLowerCase() } : null;
  if (/[a-z]/i.test(v)) return null;
  const key = phoneKey(v);
  return key ? { kind: "phone", key } : null;
}

/** The typed code as six digits ("123 456", "123-456" are fine), else null. */
export function normalizeCode(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(d) ? d : null;
}

/** A new code from a random integer (0..999999): always six digits. */
export function formatCode(n: number): string {
  return String(Math.abs(Math.trunc(n)) % 1_000_000).padStart(6, "0");
}

/** What is wrong with the new password, if anything. */
export function passwordProblem(pw: string): "short" | "long" | null {
  if (pw.length < MIN_PASSWORD) return "short";
  if (pw.length > MAX_PASSWORD) return "long";
  return null;
}

/** Tries left on the codes still open (the most of them), never below 0. */
export function triesLeft(attempts: number[]): number {
  if (!attempts.length) return 0;
  return Math.max(0, MAX_TRIES - Math.min(...attempts));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Telegram message with the code (HTML). */
export function codeMessage(code: string, name: string | null): string {
  const hello = name?.trim() ? `${esc(name.trim().split(/\s+/)[0]!)}, ` : "";
  return [
    `🔐 ${hello}SalesIQ'da parolni tiklash kodi:`,
    ``,
    `<code>${code}</code>`,
    ``,
    `Kod ${CODE_TTL_MIN} daqiqa amal qiladi. Uni hech kimga bermang — SalesIQ xodimlari ham so'ramaydi.`,
    `Siz so'ramagan bo'lsangiz, bu xabarga e'tibor bermang: parolingiz o'zgarmaydi.`,
  ].join("\n");
}

/** The Telegram message after the password was changed (HTML). */
export function changedMessage(): string {
  return [
    `✅ SalesIQ'dagi parolingiz o'zgartirildi.`,
    `Buni siz qilmagan bo'lsangiz, darhol rahbaringizga yoki SalesIQ yordamiga xabar bering.`,
  ].join("\n");
}
