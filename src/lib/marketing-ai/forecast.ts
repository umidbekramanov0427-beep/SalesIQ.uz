// Marketing AI tahlilchi -> Prognoz: what the next weeks may bring, from the
// weekly history -- a straight-line trend with a range, never a promise.
// Only with enough history (4+ full weeks); the confidence says how well
// the line fits and how long the history is. Pure.

export type WeekPoint = { week: string; value: number };

export type Forecast = {
  enough: boolean;
  /** Weeks of history used. */
  weeks: number;
  from: string | null;
  to: string | null;
  next: { week: string; value: number; low: number; high: number }[];
  /** Change per week of the trend line. */
  slope: number;
  confidence: "high" | "medium" | "low";
  /** How well the line fits (0..1). */
  r2: number;
};

export const MIN_WEEKS = 4;

/** Monday (UTC date string) of the week an ISO time falls in, Tashkent time. */
export function weekOf(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
    .toISOString()
    .slice(0, 10);
}

/** Sums by week, the empty weeks in between filled with 0. */
export function weekly(
  items: { at: string; value: number }[],
  fromIso: string,
  toIso: string,
): WeekPoint[] {
  const sums = new Map<string, number>();
  for (const it of items) sums.set(weekOf(it.at), (sums.get(weekOf(it.at)) ?? 0) + it.value);
  const out: WeekPoint[] = [];
  let w = weekOf(fromIso);
  const last = weekOf(toIso);
  while (w <= last) {
    out.push({ week: w, value: sums.get(w) ?? 0 });
    w = new Date(Date.parse(w) + 7 * 86_400_000).toISOString().slice(0, 10);
  }
  return out;
}

export function forecast(series: WeekPoint[], ahead = 4): Forecast {
  const n = series.length;
  const base = {
    weeks: n,
    from: series[0]?.week ?? null,
    to: series[n - 1]?.week ?? null,
  };
  if (n < MIN_WEEKS || series.every((p) => p.value === 0))
    return { ...base, enough: false, next: [], slope: 0, confidence: "low", r2: 0 };
  const xs = series.map((_, i) => i);
  const ys = series.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const icpt = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i]! - (icpt + slope * xs[i]!)) ** 2;
    ssTot += (ys[i]! - my) ** 2;
  }
  const r2 = ssTot ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const sd = Math.sqrt(ssRes / Math.max(1, n - 2));
  // Relative spread decides the confidence along with the history's length.
  const spread = my > 0 ? sd / my : 1;
  const confidence: Forecast["confidence"] =
    n >= 8 && spread < 0.25 ? "high" : n >= 6 && spread < 0.5 ? "medium" : "low";
  const lastWeek = series[n - 1]!.week;
  const next = Array.from({ length: ahead }, (_, k) => {
    const x = n + k;
    const v = Math.max(0, icpt + slope * x);
    const band = 1.96 * sd * Math.sqrt(1 + 1 / n + (x - mx) ** 2 / (sxx || 1));
    return {
      week: new Date(Date.parse(lastWeek) + (k + 1) * 7 * 86_400_000).toISOString().slice(0, 10),
      value: Math.round(v),
      low: Math.max(0, Math.round(v - band)),
      high: Math.round(v + band),
    };
  });
  return {
    ...base,
    enough: true,
    next,
    slope: Math.round(slope * 10) / 10,
    confidence,
    r2: Math.round(r2 * 100) / 100,
  };
}
