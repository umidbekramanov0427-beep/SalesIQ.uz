// Plan vs fact for one month: how much of the target is done, where the
// month will end at the current pace, and what is needed per remaining
// day. Pure, so the numbers on the page are tested.

export type PlanStatus = "done" | "on_track" | "behind" | "no_plan";

export type PlanProgress = {
  pct: number | null;
  forecast: number;
  forecastPct: number | null;
  perDayNeeded: number;
  daysLeft: number;
  status: PlanStatus;
};

/** First day of the month containing `d` (local), as YYYY-MM-01. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** [start, end) of a YYYY-MM-01 month in local time. */
export function monthRange(month: string): { from: Date; to: Date; days: number } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  return { from, to, days: Math.round((to.getTime() - from.getTime()) / 86_400_000) };
}

export function shiftMonth(month: string, by: number): string {
  const { from } = monthRange(month);
  return monthKey(new Date(from.getFullYear(), from.getMonth() + by, 1));
}

/**
 * `now` decides how much of the month has passed: a past month is over,
 * a future one hasn't started.
 */
export function planProgress(
  target: number,
  fact: number,
  month: string,
  now = new Date(),
): PlanProgress {
  const { from, to, days } = monthRange(month);
  const elapsedDays =
    now <= from
      ? 0
      : now >= to
        ? days
        : Math.max(1, Math.ceil((now.getTime() - from.getTime()) / 86_400_000));
  const daysLeft = days - elapsedDays;
  const forecast = elapsedDays === 0 ? fact : Math.round((fact / elapsedDays) * days);
  if (!(target > 0)) {
    return { pct: null, forecast, forecastPct: null, perDayNeeded: 0, daysLeft, status: "no_plan" };
  }
  const pct = Math.round((fact / target) * 100);
  const forecastPct = Math.round((forecast / target) * 100);
  const remaining = Math.max(0, target - fact);
  const perDayNeeded = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  const status: PlanStatus = fact >= target ? "done" : forecastPct >= 100 ? "on_track" : "behind";
  return { pct, forecast, forecastPct, perDayNeeded, daysLeft, status };
}
