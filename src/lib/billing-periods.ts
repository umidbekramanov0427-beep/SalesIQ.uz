// How long one subscription payment buys (Hisob va to'lov): 1, 3, 6, 9 or
// 12 months, the longer ones with free months on top (9 → +1, 12 → +2), as
// in 5CRM. The price is the monthly price times the months paid; the bonus
// only lengthens the period. Pure: the server and the page share it.

export const BILLING_MONTHS = [1, 3, 6, 9, 12] as const;
export type BillingMonths = (typeof BILLING_MONTHS)[number];

export const isBillingMonths = (v: unknown): v is BillingMonths =>
  (BILLING_MONTHS as readonly unknown[]).includes(v);

export function bonusMonths(m: number): number {
  return m >= 12 ? 2 : m >= 9 ? 1 : 0;
}

/** Days a paid period adds: (months + bonus) × 30. */
export function periodDays(m: number): number {
  const months = isBillingMonths(m) ? m : 1;
  return (months + bonusMonths(months)) * 30;
}

export function periodAmount(monthly: number, m: number): number {
  return Math.max(0, Math.round(monthly)) * (isBillingMonths(m) ? m : 1);
}
