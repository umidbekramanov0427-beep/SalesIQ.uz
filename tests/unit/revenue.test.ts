import { buildRevenueReport, lastMonths, monthKey, orgState, type RevenueOrg } from "@/lib/revenue";

const NOW = Date.parse("2026-10-16T09:00:00Z");
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();
const prices = {
  plans: { start_iq: 300_000, analyst_iq: 600_000, master_iq: 1_000_000 },
  extraSeat: 50_000,
};

function org(p: Partial<RevenueOrg> & { id: string }): RevenueOrg {
  return {
    name: p.id,
    phone: null,
    plan: "start_iq",
    extra_seats: 0,
    is_trial: false,
    active: true,
    trial_ends_at: iso(20),
    created_at: iso(-200),
    frozen_at: null,
    ...p,
  };
}

describe("orgState", () => {
  it("classifies every company", () => {
    expect(orgState(org({ id: "a" }), NOW)).toBe("paying");
    expect(orgState(org({ id: "b", trial_ends_at: null }), NOW)).toBe("paying");
    expect(orgState(org({ id: "c", trial_ends_at: iso(-3) }), NOW)).toBe("churned");
    expect(orgState(org({ id: "d", is_trial: true, trial_ends_at: iso(3) }), NOW)).toBe("trial");
    expect(orgState(org({ id: "e", is_trial: true, trial_ends_at: iso(-1) }), NOW)).toBe(
      "trial_expired",
    );
    expect(orgState(org({ id: "f", frozen_at: iso(-5), active: false }), NOW)).toBe("frozen");
  });
});

describe("buildRevenueReport", () => {
  const orgs = [
    org({ id: "p1", plan: "start_iq" }),
    org({ id: "p2", plan: "analyst_iq", extra_seats: 2, trial_ends_at: iso(3) }),
    org({ id: "p3", plan: "master_iq", trial_ends_at: null }),
    org({ id: "gone", plan: "analyst_iq", trial_ends_at: iso(-10) }),
    org({ id: "old", plan: "analyst_iq", trial_ends_at: iso(-60) }),
    org({ id: "t1", is_trial: true, trial_ends_at: iso(4), created_at: iso(-3) }),
    org({ id: "t2", is_trial: true, trial_ends_at: iso(-20), created_at: iso(-27) }),
    org({ id: "conv", created_at: iso(-30) }),
    org({ id: "fz", frozen_at: iso(-2), active: false }),
  ];
  const payments = [
    {
      organization_id: "p1",
      amount: 300_000,
      status: "paid",
      provider: "payme",
      paid_at: iso(-5),
      created_at: iso(-5),
    },
    {
      organization_id: "p1",
      amount: 300_000,
      status: "paid",
      provider: "payme",
      paid_at: "2026-09-10T08:00:00Z",
      created_at: "2026-09-10T08:00:00Z",
    },
    {
      organization_id: "p2",
      amount: 700_000,
      status: "paid",
      provider: "click",
      paid_at: iso(-1),
      created_at: iso(-1),
    },
    {
      organization_id: "p2",
      amount: 700_000,
      status: "pending",
      provider: "click",
      paid_at: null,
      created_at: iso(0),
    },
  ];
  const r = buildRevenueReport(orgs, payments, prices, NOW);

  it("sums MRR from paying companies only, with extra seats", () => {
    // p1 300k + p2 600k+2*50k + p3 1m + conv 300k
    expect(r.mrr).toBe(2_300_000);
    expect(r.arr).toBe(27_600_000);
    expect(r.paying).toBe(4);
    expect(r.arpa).toBe(575_000);
    expect(r.openEnded).toBe(1);
    expect(r.frozen).toBe(1);
    expect(r.trials).toBe(1);
    expect(r.byPlan.find((p) => p.plan === "analyst_iq")).toEqual({
      plan: "analyst_iq",
      count: 1,
      mrr: 700_000,
    });
  });

  it("counts churn in the last 30 days only and derives LTV", () => {
    expect(r.churn.count).toBe(1);
    expect(r.churn.mrr).toBe(600_000);
    expect(r.churn.rate).toBeCloseTo(1 / 5);
    expect(r.ltv).toBeCloseTo(575_000 * 5);
    expect(r.lifetimeMonths).toBeCloseTo(5);
    expect(r.churned.map((c) => c.id)).toEqual(["gone"]);
  });

  it("lists renewals due within 7 days", () => {
    expect(r.renewals.map((o) => [o.id, o.days])).toEqual([["p2", 3]]);
  });

  it("measures trial conversion on finished trials", () => {
    // created 7..97 days ago: t2 (trial) and conv (paid)
    expect(r.conversion).toEqual({ started: 2, converted: 1, rate: 0.5 });
  });

  it("charts collected money per month and first payments", () => {
    expect(r.months).toHaveLength(12);
    const oct = r.months.at(-1)!;
    expect(oct.month).toBe("2026-10");
    expect(oct.collected).toBe(1_000_000);
    expect(oct.newPaying).toBe(1);
    expect(r.months.at(-2)).toMatchObject({ month: "2026-09", collected: 300_000, newPaying: 1 });
    expect(r.collectedLast30).toBe(1_000_000);
    expect(r.recent[0]!.status).toBe("pending");
  });

  it("has no LTV while nobody churned", () => {
    const calm = buildRevenueReport([org({ id: "x" })], [], prices, NOW);
    expect(calm.churn.rate).toBe(0);
    expect(calm.ltv).toBeNull();
  });
});

describe("months", () => {
  it("uses Tashkent time", () => {
    expect(monthKey("2026-09-30T20:00:00Z")).toBe("2026-10");
    expect(lastMonths(NOW, 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(lastMonths(Date.parse("2026-01-15T00:00:00Z"), 2)).toEqual(["2025-12", "2026-01"]);
  });
});
