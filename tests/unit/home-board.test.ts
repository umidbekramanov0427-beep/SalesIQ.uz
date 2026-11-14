import { cleanLayout } from "@/components/dashboard/HomeBoard";

const byId = new Map(
  ["kpi:a", "kpi:b", "revenue", "today"].map((id) => [
    id,
    { sizes: id.startsWith("kpi:") ? ([3, 4, 6, 12] as const) : ([4, 6, 8, 12] as const) },
  ]),
) as unknown as Map<string, { sizes: (3 | 4 | 6 | 8 | 12)[] }>;
const defaults = {
  order: ["kpi:a", "kpi:b", "revenue"],
  size: { "kpi:a": 3, "kpi:b": 3 } as const,
};

describe("Bosh sahifa board", () => {
  it("splits the old KPI row into its cards, in place, at the default width", () => {
    const out = cleanLayout(
      { order: ["today", "kpis", "revenue"], size: { today: 4, kpis: 12, revenue: 8 } },
      byId,
      defaults,
      { kpis: ["kpi:a", "kpi:b"] },
    );
    expect(out.order).toEqual(["today", "kpi:a", "kpi:b", "revenue"]);
    expect(out.size).toEqual({ today: 4, "kpi:a": 3, "kpi:b": 3, revenue: 8 });
  });

  it("drops unknown widgets and snaps a size that no longer fits", () => {
    const out = cleanLayout({ order: ["gone", "revenue"], size: { revenue: 3 } }, byId, defaults);
    expect(out).toEqual({ order: ["revenue"], size: { revenue: 12 } });
  });
});
