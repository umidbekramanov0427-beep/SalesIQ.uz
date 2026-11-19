// Marketing -> Reklama: ad spend against the leads and sales each source
// brought (cost per lead, per sale, ROI) and the won revenue per month.
// Pure, so the server and the tests agree. Money is the company's currency
// (so'm); a lead's amount is its budget.

export type FinEntry = {
  id: string;
  entry_date: string;
  kind: "income" | "expense";
  category: string;
  source: string | null;
  amount: number;
  note: string | null;
};

export type FLead = {
  source: string | null;
  created_at: string;
  stage_changed_at: string | null;
  budget: number | null;
  won: boolean;
};

/** An instant range [from, to) as ISO strings (see analytics-reports parseRange). */
export type FRange = { from: string; to: string };

export const MARKETING = "marketing";

/** Expense categories offered in the form (free text is allowed too). */
export const EXPENSE_CATEGORIES = [
  "marketing",
  "salary",
  "rent",
  "tax",
  "services",
  "other",
] as const;
export const INCOME_CATEGORIES = ["sales_other", "investment", "other"] as const;

const inRange = (iso: string | null | undefined, r: FRange) => !!iso && iso >= r.from && iso < r.to;
/** A "YYYY-MM-DD" entry date as the start of that Tashkent day. */
export const dayStartIso = (d: string) => new Date(`${d}T00:00:00+05:00`).toISOString();
const entryIn = (e: FinEntry, r: FRange) => inRange(dayStartIso(e.entry_date), r);
const sourceKey = (s: string | null | undefined) => s?.trim() || null;
const ratio = (a: number, b: number) => (b > 0 ? Math.round(a / b) : null);

export type SourceRow = {
  source: string | null;
  spend: number;
  leads: number;
  won: number;
  revenue: number;
  /** Spend per new lead; null without leads. */
  cpl: number | null;
  /** Spend per sale; null without sales. */
  cac: number | null;
  /** (revenue - spend) / spend, percent; null without spend. */
  roi: number | null;
};

export function marketingBySource(
  leads: FLead[],
  entries: FinEntry[],
  r: FRange,
): { rows: SourceRow[]; total: SourceRow } {
  const map = new Map<
    string | null,
    { spend: number; leads: number; won: number; revenue: number }
  >();
  const get = (k: string | null) => {
    let x = map.get(k);
    if (!x) {
      x = { spend: 0, leads: 0, won: 0, revenue: 0 };
      map.set(k, x);
    }
    return x;
  };
  for (const l of leads) {
    const k = sourceKey(l.source);
    if (inRange(l.created_at, r)) get(k).leads += 1;
    if (l.won && inRange(l.stage_changed_at, r)) {
      const x = get(k);
      x.won += 1;
      x.revenue += Number(l.budget) || 0;
    }
  }
  for (const e of entries) {
    if (e.kind === "expense" && e.category === MARKETING && entryIn(e, r)) {
      get(sourceKey(e.source)).spend += Number(e.amount) || 0;
    }
  }
  const row = (
    source: string | null,
    x: { spend: number; leads: number; won: number; revenue: number },
  ): SourceRow => ({
    source,
    ...x,
    cpl: x.spend ? ratio(x.spend, x.leads) : null,
    cac: x.spend ? ratio(x.spend, x.won) : null,
    roi: x.spend > 0 ? Math.round(((x.revenue - x.spend) / x.spend) * 1000) / 10 : null,
  });
  const rows = [...map]
    .map(([s, x]) => row(s, x))
    .sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  const sum = rows.reduce(
    (t, x) => ({
      spend: t.spend + x.spend,
      leads: t.leads + x.leads,
      won: t.won + x.won,
      revenue: t.revenue + x.revenue,
    }),
    { spend: 0, leads: 0, won: 0, revenue: 0 },
  );
  return { rows, total: row(null, sum) };
}

export type MonthPoint = { month: string; revenue: number; won: number };

/** Won revenue per Tashkent month for the last `count` months, oldest first. */
export function monthlyRevenue(leads: FLead[], now: Date, count = 6): MonthPoint[] {
  const local = new Date(now.getTime() + 5 * 3_600_000);
  const months: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), revenue: 0, won: 0 });
  }
  const idx = new Map(months.map((m, i) => [m.month, i]));
  for (const l of leads) {
    if (!l.won || !l.stage_changed_at) continue;
    const key = new Date(new Date(l.stage_changed_at).getTime() + 5 * 3_600_000)
      .toISOString()
      .slice(0, 7);
    const i = idx.get(key);
    if (i == null) continue;
    months[i]!.revenue += Number(l.budget) || 0;
    months[i]!.won += 1;
  }
  return months;
}
