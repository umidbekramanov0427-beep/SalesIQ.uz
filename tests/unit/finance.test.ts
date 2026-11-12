import {
  marketingBySource,
  monthForecast,
  monthlyRevenue,
  profitAndLoss,
  type FinEntry,
  type FLead,
} from "@/lib/finance";

const r = { from: "2026-10-31T19:00:00.000Z", to: "2026-11-30T19:00:00.000Z" }; // November, Tashkent
const lead = (
  source: string | null,
  created: string,
  won = false,
  budget = 0,
  closed?: string,
): FLead => ({
  source,
  created_at: created,
  stage_changed_at: closed ?? created,
  budget,
  won,
});
const entry = (e: Partial<FinEntry>): FinEntry => ({
  id: Math.random().toString(36),
  entry_date: "2026-11-05",
  kind: "expense",
  category: "marketing",
  source: null,
  amount: 0,
  note: null,
  ...e,
});

describe("finance", () => {
  it("works out cost per lead, per sale and ROI by source", () => {
    const leads = [
      lead("Instagram", "2026-11-02T08:00:00Z", true, 6_000_000),
      lead("Instagram", "2026-11-03T08:00:00Z"),
      lead("Instagram", "2026-11-04T08:00:00Z"),
      lead("Instagram", "2026-11-05T08:00:00Z"),
      lead("Sayt", "2026-11-06T08:00:00Z"),
      lead("Instagram", "2026-10-20T08:00:00Z"), // October: not counted as a new lead
    ];
    const entries = [
      entry({ source: "Instagram", amount: 2_000_000 }),
      entry({ source: "Instagram", amount: 2_000_000, entry_date: "2026-11-20" }),
      entry({ source: "Instagram", amount: 9e9, entry_date: "2026-10-30" }), // outside
      entry({ category: "rent", amount: 5_000_000 }), // not marketing
    ];
    const { rows, total } = marketingBySource(leads, entries, r);
    const ig = rows.find((x) => x.source === "Instagram")!;
    expect(ig).toEqual({
      source: "Instagram",
      spend: 4_000_000,
      leads: 4,
      won: 1,
      revenue: 6_000_000,
      cpl: 1_000_000,
      cac: 4_000_000,
      roi: 50,
    });
    const site = rows.find((x) => x.source === "Sayt")!;
    expect(site.cpl).toBeNull();
    expect(site.roi).toBeNull();
    expect(total.spend).toBe(4_000_000);
    expect(total.leads).toBe(5);
  });

  it("builds the profit and loss", () => {
    const p = profitAndLoss(
      20_000_000,
      [
        entry({ amount: 3_000_000 }),
        entry({ category: "rent", amount: 5_000_000 }),
        entry({ category: "rent", amount: 1_000_000 }),
        entry({ kind: "income", category: "investment", amount: 2_000_000 }),
        entry({ category: "rent", amount: 7e9, entry_date: "2026-12-01" }),
      ],
      r,
    );
    expect(p.expenses).toEqual([
      { category: "rent", amount: 6_000_000 },
      { category: "marketing", amount: 3_000_000 },
    ]);
    expect(p.totalIncome).toBe(22_000_000);
    expect(p.totalExpense).toBe(9_000_000);
    expect(p.profit).toBe(13_000_000);
    expect(p.marginPct).toBe(59.1);
    expect(profitAndLoss(0, [], r).marginPct).toBeNull();
  });

  it("projects the month", () => {
    const now = new Date("2026-11-10T07:00:00Z"); // 10 Nov, Tashkent
    const leads = [
      lead(null, "2026-11-02T08:00:00Z", true, 10_000_000),
      lead(null, "2026-10-02T08:00:00Z", true, 30_000_000),
      lead(null, "2026-09-02T08:00:00Z", true, 15_000_000),
      lead(null, "2026-08-02T08:00:00Z", true, 15_000_000),
      lead(null, "2026-11-03T08:00:00Z", false, 99),
    ];
    const months = monthlyRevenue(leads, now);
    expect(months.map((m) => m.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(months.at(-1)).toEqual({ month: "2026-11", revenue: 10_000_000, won: 1 });
    const f = monthForecast(months, now, 12_345_678.4);
    expect(f.daysPassed).toBe(10);
    expect(f.daysInMonth).toBe(30);
    expect(f.runRate).toBe(30_000_000);
    expect(f.avgPrev3).toBe(20_000_000);
    expect(f.pipelineWeighted).toBe(12_345_678);
  });
});
