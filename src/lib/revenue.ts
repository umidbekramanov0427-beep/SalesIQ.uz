// The platform's revenue metrics (Platforma → Daromad): MRR, churn, LTV,
// trial conversion and collected payments. Pure, so the numbers are
// unit-tested; the facts are gathered in revenue.server.ts.
//
// A paying company is one past its trial, not frozen or switched off, whose
// paid period (organizations.trial_ends_at, extended 30 days per payment)
// hasn't ended; no end date = paid without a deadline (set by hand). Its
// monthly price is its plan's price plus its extra seats.
import { effectivePriceUzs, normalizePlan, type Plan } from "@/lib/plan-gating";

const DAY = 24 * 60 * 60 * 1000;

export type RevenueOrg = {
  id: string;
  name: string;
  phone: string | null;
  plan: string | null;
  extra_seats: number | null;
  is_trial: boolean | null;
  active: boolean | null;
  trial_ends_at: string | null;
  created_at: string;
  frozen_at?: string | null;
};

export type RevenuePayment = {
  id?: string;
  organization_id: string;
  amount: number;
  status: string;
  provider: string;
  paid_at: string | null;
  created_at: string;
};

export type Prices = { plans: Record<Plan, number>; extraSeat: number };

export type OrgState = "paying" | "trial" | "frozen" | "churned" | "trial_expired" | "inactive";

export function orgState(org: RevenueOrg, now: number): OrgState {
  if (org.frozen_at) return "frozen";
  const ended = !!org.trial_ends_at && new Date(org.trial_ends_at).getTime() <= now;
  if (org.is_trial) return ended || org.active === false ? "trial_expired" : "trial";
  if (org.active === false) return ended ? "churned" : "inactive";
  return ended ? "churned" : "paying";
}

export function monthlyPrice(org: RevenueOrg, prices: Prices): number {
  return effectivePriceUzs(org.plan, org.extra_seats ?? 0, prices.plans, prices.extraSeat);
}

/** "2026-10" in Tashkent time (UTC+5, no daylight saving). */
export function monthKey(iso: string | number): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last `n` month keys, oldest first, ending with the current month. */
export function lastMonths(now: number, n: number): string[] {
  const d = new Date(now + 5 * 3600 * 1000);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export type OrgLine = {
  id: string;
  name: string;
  phone: string | null;
  plan: Plan;
  mrr: number;
  /** End of the paid period (or trial). */
  endsAt: string | null;
  days: number | null;
};

export type RevenueReport = {
  mrr: number;
  arr: number;
  paying: number;
  /** Average monthly revenue per paying company. */
  arpa: number;
  byPlan: { plan: Plan; count: number; mrr: number }[];
  trials: number;
  frozen: number;
  /** Paid without an end date (set by hand). */
  openEnded: number;
  conversion: { started: number; converted: number; rate: number | null };
  churn: { count: number; mrr: number; rate: number | null; revenueRate: number | null };
  /** ARPA ÷ monthly churn; null while nobody has churned (or nobody pays). */
  ltv: number | null;
  /** 1 ÷ monthly churn, in months. */
  lifetimeMonths: number | null;
  renewals: OrgLine[];
  churned: OrgLine[];
  months: { month: string; collected: number; payments: number; newPaying: number }[];
  collectedThisMonth: number;
  collectedLast30: number;
  recent: (RevenuePayment & { orgName: string })[];
};

const WINDOW = 30 * DAY;

export function buildRevenueReport(
  orgs: RevenueOrg[],
  payments: RevenuePayment[],
  prices: Prices,
  now: number,
): RevenueReport {
  const line = (o: RevenueOrg): OrgLine => {
    const end = o.trial_ends_at ? new Date(o.trial_ends_at).getTime() : null;
    return {
      id: o.id,
      name: o.name,
      phone: o.phone,
      plan: normalizePlan(o.plan),
      mrr: monthlyPrice(o, prices),
      endsAt: o.trial_ends_at,
      days: end == null ? null : Math.ceil((end - now) / DAY),
    };
  };

  const states = orgs.map((o) => ({ o, s: orgState(o, now) }));
  const paying = states.filter((x) => x.s === "paying").map((x) => x.o);
  const mrr = paying.reduce((sum, o) => sum + monthlyPrice(o, prices), 0);

  const planOrder: Plan[] = ["start_iq", "analyst_iq", "master_iq"];
  const byPlan = planOrder.map((plan) => {
    const list = paying.filter((o) => normalizePlan(o.plan) === plan);
    return { plan, count: list.length, mrr: list.reduce((s, o) => s + monthlyPrice(o, prices), 0) };
  });

  // Churn: paid periods that ended in the last 30 days without a renewal.
  const churnedOrgs = states
    .filter((x) => x.s === "churned")
    .map((x) => x.o)
    .filter((o) => {
      const end = o.trial_ends_at ? new Date(o.trial_ends_at).getTime() : null;
      return end != null && end > now - WINDOW && end <= now;
    });
  const churnMrr = churnedOrgs.reduce((s, o) => s + monthlyPrice(o, prices), 0);
  const atStart = paying.length + churnedOrgs.length;
  const churnRate = atStart > 0 ? churnedOrgs.length / atStart : null;
  const revenueRate = mrr + churnMrr > 0 ? churnMrr / (mrr + churnMrr) : null;
  const arpa = paying.length ? mrr / paying.length : 0;
  const ltv = churnRate && arpa > 0 ? arpa / churnRate : null;

  // Trial → paid: companies that signed up 7..97 days ago (their trial is over).
  const cohort = orgs.filter((o) => {
    const age = now - new Date(o.created_at).getTime();
    return age >= 7 * DAY && age < 97 * DAY;
  });
  const converted = cohort.filter((o) => !o.is_trial).length;

  const renewals = paying
    .map(line)
    .filter((l) => l.days != null && l.days <= 7)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const paid = payments.filter((p) => p.status === "paid" && p.paid_at);
  const firstPaid = new Map<string, string>();
  for (const p of [...paid].sort((a, b) => a.paid_at!.localeCompare(b.paid_at!))) {
    if (!firstPaid.has(p.organization_id)) firstPaid.set(p.organization_id, p.paid_at!);
  }
  const keys = lastMonths(now, 12);
  const months = keys.map((month) => {
    const inMonth = paid.filter((p) => monthKey(p.paid_at!) === month);
    return {
      month,
      collected: inMonth.reduce((s, p) => s + Number(p.amount || 0), 0),
      payments: inMonth.length,
      newPaying: [...firstPaid.values()].filter((at) => monthKey(at) === month).length,
    };
  });

  const names = new Map(orgs.map((o) => [o.id, o.name]));
  const recent = [...payments]
    .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at))
    .slice(0, 15)
    .map((p) => ({ ...p, orgName: names.get(p.organization_id) ?? "—" }));

  return {
    mrr,
    arr: mrr * 12,
    paying: paying.length,
    arpa,
    byPlan,
    trials: states.filter((x) => x.s === "trial").length,
    frozen: states.filter((x) => x.s === "frozen").length,
    openEnded: paying.filter((o) => !o.trial_ends_at).length,
    conversion: {
      started: cohort.length,
      converted,
      rate: cohort.length ? converted / cohort.length : null,
    },
    churn: { count: churnedOrgs.length, mrr: churnMrr, rate: churnRate, revenueRate },
    ltv,
    lifetimeMonths: churnRate ? 1 / churnRate : null,
    renewals,
    churned: churnedOrgs.map(line).sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    months,
    collectedThisMonth: months.at(-1)?.collected ?? 0,
    collectedLast30: paid
      .filter((p) => new Date(p.paid_at!).getTime() > now - WINDOW)
      .reduce((s, p) => s + Number(p.amount || 0), 0),
    recent,
  };
}
