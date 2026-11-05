// Bosh sahifa's KPI cards, each with the formulas a person can pick in the
// card's own settings (the sliders button): the same plain rows as
// home-overview.ts, reduced the way the picked formula says -- for the
// card's number, its per-day series and the per-manager list view.

import {
  deltaPct,
  type Kpi,
  type OverviewCall,
  type OverviewLead,
  type Range,
} from "./home-overview";

export type MetricId =
  "newLeads" | "revenue" | "firstContact" | "attempts" | "cycle" | "conversion";

export const METRIC_FORMULAS = {
  newLeads: ["all", "contacted", "notContacted"],
  revenue: ["sum", "avgDeal", "deals"],
  firstContact: ["avg", "median", "within1h"],
  attempts: ["avg", "median", "firstTry"],
  cycle: ["avg", "median"],
  conversion: ["cohort", "period"],
} as const satisfies Record<MetricId, readonly string[]>;

export type Unit = "count" | "money" | "hours" | "times" | "days" | "pct";

export type MetricLead = OverviewLead & { owner_id?: string | null };
export type MetricCall = OverviewCall & { owner_id?: string | null };
export type MetricInput = {
  leads: MetricLead[];
  calls: MetricCall[];
  isSale: (stageId: string | null) => boolean;
};

/** The first formula is the card's default -- what it always showed. */
export function defaultFormula(m: MetricId): string {
  return METRIC_FORMULAS[m][0];
}

export function isFormula(m: MetricId, f: string | undefined): boolean {
  return !!f && (METRIC_FORMULAS[m] as readonly string[]).includes(f);
}

export function formulaUnit(m: MetricId, f: string): Unit {
  if (m === "newLeads") return "count";
  if (m === "revenue") return f === "deals" ? "count" : "money";
  if (m === "firstContact") return f === "within1h" ? "pct" : "hours";
  if (m === "attempts") return f === "firstTry" ? "pct" : "times";
  if (m === "cycle") return "days";
  return "pct";
}

/** Smaller is better: a falling number is good news (green). */
export function lowerIsBetter(m: MetricId, f: string): boolean {
  if (m === "newLeads") return f === "notContacted";
  if (m === "firstContact") return f !== "within1h";
  if (m === "attempts") return f !== "firstTry";
  return m === "cycle";
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ms = (iso: string) => new Date(iso).getTime();
const inRange = (t: number, r: Range) => t >= r.from.getTime() && t < r.to.getTime();

type Item = { ms: number; v: number };
type How = "sum" | "avg" | "median";

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function reduce(vs: number[], how: How): number | null {
  if (how === "sum") return vs.reduce((a, b) => a + b, 0);
  if (!vs.length) return null;
  return how === "avg" ? vs.reduce((a, b) => a + b, 0) / vs.length : median(vs);
}

/** A formula as items in a period and how they reduce to one number. */
type Plan =
  | { kind: "items"; items: (r: Range) => Item[]; how: How }
  | { kind: "ratio"; num: (r: Range) => Item[]; den: (r: Range) => Item[] };

function plan(m: MetricId, f: string, input: MetricInput): Plan {
  const { leads, calls, isSale } = input;
  const created = (r: Range) => leads.filter((l) => inRange(ms(l.created_at), r));
  const sold = (r: Range) =>
    leads.filter(
      (l) => isSale(l.stage_id) && l.stage_changed_at && inRange(ms(l.stage_changed_at), r),
    );
  const soldItems = (r: Range, v: (l: MetricLead) => number) =>
    sold(r).map((l) => ({ ms: ms(l.stage_changed_at!), v: v(l) }));
  const contactHours = (r: Range) =>
    created(r)
      .filter((l) => l.first_contact_at)
      .map((l) => ({
        ms: ms(l.created_at),
        v: Math.max(0, (ms(l.first_contact_at!) - ms(l.created_at)) / HOUR),
      }));
  // Calls up to and including the first one that connected, per lead.
  const firstReach = (r: Range) => {
    const byLead = new Map<string, MetricCall[]>();
    for (const c of calls) {
      if (!c.lead_id) continue;
      const list = byLead.get(c.lead_id) ?? [];
      list.push(c);
      byLead.set(c.lead_id, list);
    }
    const out: { ms: number; attempts: number }[] = [];
    for (const list of byLead.values()) {
      list.sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at));
      const i = list.findIndex((c) => c.connected);
      if (i < 0) continue;
      const t = ms(list[i]!.occurred_at);
      if (inRange(t, r)) out.push({ ms: t, attempts: i + 1 });
    }
    return out;
  };

  switch (m) {
    case "newLeads": {
      const keep = (l: MetricLead) =>
        f === "contacted"
          ? !!l.first_contact_at
          : f === "notContacted"
            ? !l.first_contact_at
            : true;
      return {
        kind: "items",
        how: "sum",
        items: (r) =>
          created(r)
            .filter(keep)
            .map((l) => ({ ms: ms(l.created_at), v: 1 })),
      };
    }
    case "revenue":
      return f === "deals"
        ? { kind: "items", how: "sum", items: (r) => soldItems(r, () => 1) }
        : {
            kind: "items",
            how: f === "avgDeal" ? "avg" : "sum",
            items: (r) => soldItems(r, (l) => Number(l.budget) || 0),
          };
    case "firstContact":
      return f === "within1h"
        ? {
            kind: "items",
            how: "avg",
            items: (r) => contactHours(r).map((x) => ({ ms: x.ms, v: x.v <= 1 ? 100 : 0 })),
          }
        : { kind: "items", how: f === "median" ? "median" : "avg", items: contactHours };
    case "attempts":
      return f === "firstTry"
        ? {
            kind: "items",
            how: "avg",
            items: (r) => firstReach(r).map((x) => ({ ms: x.ms, v: x.attempts === 1 ? 100 : 0 })),
          }
        : {
            kind: "items",
            how: f === "median" ? "median" : "avg",
            items: (r) => firstReach(r).map((x) => ({ ms: x.ms, v: x.attempts })),
          };
    case "cycle":
      return {
        kind: "items",
        how: f === "median" ? "median" : "avg",
        items: (r) =>
          soldItems(r, (l) => Math.max(0, (ms(l.stage_changed_at!) - ms(l.created_at)) / DAY)),
      };
    case "conversion":
      // cohort: of the leads that came in the period, the share now sold.
      // period: sales made in the period per lead that came in it.
      return f === "period"
        ? {
            kind: "ratio",
            num: (r) => soldItems(r, () => 1),
            den: (r) => created(r).map((l) => ({ ms: ms(l.created_at), v: 1 })),
          }
        : {
            kind: "items",
            how: "avg",
            items: (r) =>
              created(r).map((l) => ({ ms: ms(l.created_at), v: isSale(l.stage_id) ? 100 : 0 })),
          };
  }
}

function days(r: Range) {
  return Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / DAY));
}

function perDay(items: Item[], r: Range): number[][] {
  const out = Array.from({ length: days(r) }, () => [] as number[]);
  for (const it of items) {
    const i = Math.floor((it.ms - r.from.getTime()) / DAY);
    if (i >= 0 && i < out.length) out[i]!.push(it.v);
  }
  return out;
}

function valueOf(p: Plan, r: Range): number | null {
  if (p.kind === "items")
    return reduce(
      p.items(r).map((x) => x.v),
      p.how,
    );
  const den = p.den(r).length;
  return den ? (p.num(r).length / den) * 100 : null;
}

function seriesOf(p: Plan, r: Range): (number | null)[] {
  if (p.kind === "items") {
    return perDay(p.items(r), r).map((vs) =>
      p.how === "sum" ? reduce(vs, "sum") : reduce(vs, p.how),
    );
  }
  const num = perDay(p.num(r), r);
  return perDay(p.den(r), r).map((d, i) => (d.length ? (num[i]!.length / d.length) * 100 : null));
}

/** The card's number for the period, against the period before, with its per-day series. */
export function computeMetric(
  m: MetricId,
  f: string,
  input: MetricInput,
  range: Range,
  prevRange: Range,
): Kpi {
  const p = plan(m, f, input);
  const value = valueOf(p, range);
  const prev = valueOf(p, prevRange);
  return { value, prev, deltaPct: deltaPct(value, prev), series: seriesOf(p, range) };
}

/**
 * The list view: the same formula per manager (by the lead's owner), best
 * first. Managers with nothing to measure in the period are left out.
 */
export function metricByOwner(
  m: MetricId,
  f: string,
  input: MetricInput,
  range: Range,
): { ownerId: string; value: number }[] {
  const owners = new Set<string>();
  for (const l of input.leads) if (l.owner_id) owners.add(l.owner_id);
  for (const c of input.calls) if (c.owner_id) owners.add(c.owner_id);
  const out: { ownerId: string; value: number }[] = [];
  for (const id of owners) {
    const p = plan(m, f, {
      leads: input.leads.filter((l) => l.owner_id === id),
      calls: input.calls.filter((c) => c.owner_id === id),
      isSale: input.isSale,
    });
    const empty = p.kind === "items" ? !p.items(range).length : !p.den(range).length;
    const v = empty ? null : valueOf(p, range);
    if (v != null) out.push({ ownerId: id, value: v });
  }
  const low = lowerIsBetter(m, f);
  return out.sort((a, b) => (low ? a.value - b.value : b.value - a.value));
}
