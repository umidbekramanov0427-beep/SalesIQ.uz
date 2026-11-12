// Moliya (Analitika -> Reklama / Moliya / Prognoz): ad spend against the
// leads and sales each source brought (cost per lead, per sale, ROI), the
// period's profit and loss, and where the month is heading. Pure, so the
// server endpoint and the tests agree. Money is the company's currency
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

export type Pnl = {
  salesRevenue: number;
  otherIncome: { category: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  profit: number;
  /** profit / income, percent; null without income. */
  marginPct: number | null;
};

const byCategory = (list: FinEntry[]) => {
  const m = new Map<string, number>();
  for (const e of list) m.set(e.category, (m.get(e.category) ?? 0) + (Number(e.amount) || 0));
  return [...m]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
};

/** Sales revenue (won leads) plus the company's own lines for the period. */
export function profitAndLoss(salesRevenue: number, entries: FinEntry[], r: FRange): Pnl {
  const inPeriod = entries.filter((e) => entryIn(e, r));
  const otherIncome = byCategory(inPeriod.filter((e) => e.kind === "income"));
  const expenses = byCategory(inPeriod.filter((e) => e.kind === "expense"));
  const totalIncome = salesRevenue + otherIncome.reduce((s, x) => s + x.amount, 0);
  const totalExpense = expenses.reduce((s, x) => s + x.amount, 0);
  const profit = totalIncome - totalExpense;
  return {
    salesRevenue,
    otherIncome,
    expenses,
    totalIncome,
    totalExpense,
    profit,
    marginPct: totalIncome > 0 ? Math.round((profit / totalIncome) * 1000) / 10 : null,
  };
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

export type MonthForecast = {
  soFar: number;
  daysPassed: number;
  daysInMonth: number;
  /** The month at today's daily pace. */
  runRate: number;
  /** Open deals weighted by their stage's probability. */
  pipelineWeighted: number;
  /** Average of the last three full months, for comparison. */
  avgPrev3: number;
};

export function monthForecast(
  months: MonthPoint[],
  now: Date,
  pipelineWeighted: number,
): MonthForecast {
  const local = new Date(now.getTime() + 5 * 3_600_000);
  const daysInMonth = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const daysPassed = local.getUTCDate();
  const soFar = months.at(-1)?.revenue ?? 0;
  const prev = months.slice(-4, -1);
  return {
    soFar,
    daysPassed,
    daysInMonth,
    runRate: Math.round((soFar / Math.max(1, daysPassed)) * daysInMonth),
    pipelineWeighted: Math.round(pipelineWeighted),
    avgPrev3: prev.length ? Math.round(prev.reduce((s, m) => s + m.revenue, 0) / prev.length) : 0,
  };
}

export type FinanceData = {
  marketing: { rows: SourceRow[]; total: SourceRow };
  /** Only for the company's admin. */
  pnl: Pnl | null;
  entries: FinEntry[] | null;
  months: MonthPoint[];
  forecast: MonthForecast;
  sources: string[];
  truncated: boolean;
};
