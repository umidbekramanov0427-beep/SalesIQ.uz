// Oylik (Nazorat -> Oylik): each employee's pay scheme -- a fixed salary,
// a percentage of their sales, an amount per sale, KPI bonuses by how much
// of the monthly plan they reached, and whether fines are taken off -- and
// the month's pay worked out from it. Stored in
// org_general_settings.payroll_rules; pure, so the page and its tests agree.

export type KpiStep = {
  /** Percent of the monthly plan reached, e.g. 100. */
  minPct: number;
  bonus: number;
};

export type PayScheme = {
  fixed: number;
  /** Percent of the month's sales revenue. */
  salesPct: number;
  /** Amount for every sale. */
  perSale: number;
  /** The highest step reached pays; steps are kept sorted by minPct. */
  kpi: KpiStep[];
  deductFines: boolean;
};

export type PayrollRules = {
  /** The scheme for anyone without their own. */
  base: PayScheme;
  /** profile id -> their own scheme. */
  people: Record<string, PayScheme>;
};

export const EMPTY_SCHEME: PayScheme = {
  fixed: 0,
  salesPct: 0,
  perSale: 0,
  kpi: [],
  deductFines: true,
};

export const DEFAULT_PAYROLL: PayrollRules = { base: EMPTY_SCHEME, people: {} };

const money = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;

export function parseScheme(raw: unknown): PayScheme {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_SCHEME;
  const o = raw as Record<string, unknown>;
  const pct =
    typeof o["salesPct"] === "number" && Number.isFinite(o["salesPct"]) ? o["salesPct"] : 0;
  const kpi = Array.isArray(o["kpi"])
    ? (o["kpi"] as unknown[])
        .flatMap((s): KpiStep[] => {
          if (!s || typeof s !== "object") return [];
          const x = s as Record<string, unknown>;
          const minPct = money(x["minPct"]);
          const bonus = money(x["bonus"]);
          return minPct > 0 && minPct <= 1000 && bonus > 0 ? [{ minPct, bonus }] : [];
        })
        .sort((a, b) => a.minPct - b.minPct)
        .slice(0, 6)
    : [];
  return {
    fixed: money(o["fixed"]),
    salesPct: Math.min(100, Math.max(0, Math.round(pct * 100) / 100)),
    perSale: money(o["perSale"]),
    kpi,
    deductFines: o["deductFines"] !== false,
  };
}

export function parsePayrollRules(raw: unknown): PayrollRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_PAYROLL;
  const o = raw as Record<string, unknown>;
  const people: Record<string, PayScheme> = {};
  if (o["people"] && typeof o["people"] === "object") {
    for (const [id, s] of Object.entries(o["people"] as Record<string, unknown>)) {
      people[id] = parseScheme(s);
    }
  }
  return { base: parseScheme(o["base"]), people };
}

export function schemeFor(rules: PayrollRules, profileId: string): PayScheme {
  return rules.people[profileId] ?? rules.base;
}

export function isEmptyScheme(s: PayScheme): boolean {
  return !s.fixed && !s.salesPct && !s.perSale && s.kpi.length === 0;
}

export type PayInput = {
  revenue: number;
  salesCount: number;
  /** Percent of the monthly plan reached; null when there is no plan. */
  planPct: number | null;
  fines: number;
};

export type PayLine = {
  fixed: number;
  commission: number;
  perSale: number;
  bonus: number;
  /** The KPI step that paid, if any. */
  step: KpiStep | null;
  fines: number;
  total: number;
};

export function computePay(scheme: PayScheme, input: PayInput): PayLine {
  const commission = Math.round((Math.max(0, input.revenue) * scheme.salesPct) / 100);
  const perSale = scheme.perSale * Math.max(0, input.salesCount);
  const step =
    input.planPct == null
      ? null
      : ([...scheme.kpi].reverse().find((s) => (input.planPct ?? 0) >= s.minPct) ?? null);
  const bonus = step?.bonus ?? 0;
  const fines = scheme.deductFines ? Math.max(0, Math.round(input.fines)) : 0;
  const total = Math.max(0, scheme.fixed + commission + perSale + bonus - fines);
  return { fixed: scheme.fixed, commission, perSale, bonus, step, fines, total };
}

/** The first and last moment of a month (local time), for the month picker. */
export function monthRange(year: number, month0: number): { from: Date; to: Date } {
  return {
    from: new Date(year, month0, 1, 0, 0, 0, 0),
    to: new Date(year, month0 + 1, 0, 23, 59, 59, 999),
  };
}
