// Monthly payment links (lead_payment_schedules): on the chosen day of each
// month the 5-minute cron makes a new link for the client and sends it to
// their Telegram / Instagram chat; a link still unpaid after a few days
// gets one reminder. Dates are Tashkent calendar days. Pure, so the
// calendar rules are unit-tested; recurring.server.ts runs them.

import { formatSom } from "./paid-stage";

const TASHKENT_OFFSET_MS = 5 * 3600_000;

/** "2026-10-16" in Tashkent. */
export function tashkentToday(now: number): string {
  return new Date(now + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

export function tashkentHour(now: number): number {
  return new Date(now + TASHKENT_OFFSET_MS).getUTCHours();
}

/** Links go out from 09:00 to 20:59 Tashkent, not at night. */
export function inSendingHours(now: number): boolean {
  const h = tashkentHour(now);
  return h >= 9 && h < 21;
}

/** Days 1..28 only, so every month has the day. */
export function clampDay(day: unknown): number | null {
  const n = Math.round(Number(day));
  return Number.isFinite(n) && n >= 1 && n <= 28 ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The `day` of the month after the one `fromDate` ("YYYY-MM-DD") is in. */
export function nextMonthOn(day: number, fromDate: string): string {
  const [y, m] = fromDate.split("-").map(Number) as [number, number];
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The first automatic run of a new schedule: later this month when the
 * day is still ahead, otherwise next month. `sentNow` -- the manager sent
 * this month's link by hand just now -- always starts next month.
 */
export function firstRunOn(day: number, today: string, sentNow: boolean): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  if (!sentNow && day > d) return `${y}-${pad(m)}-${pad(day)}`;
  return nextMonthOn(day, today);
}

/** The text the client gets with a payment link (lead card and cron alike). */
export function paymentLinkText(
  row: { amount: number; description: string | null },
  url: string,
): string {
  return [
    row.description || null,
    `To'lov: ${formatSom(row.amount)} so'm`,
    `Payme yoki Click orqali to'lash: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function reminderText(row: { amount: number; description: string | null }, url: string) {
  return `Eslatma: ${formatSom(row.amount)} so'm to'lov hali kutilmoqda.\n${paymentLinkText(row, url)}`;
}

/** Reminder once, after this many days unpaid. */
export const REMIND_AFTER_DAYS = 3;
