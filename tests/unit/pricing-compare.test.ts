import { planCostFor, teamCosts } from "@/lib/pricing-compare";

const prices = { start_iq: 500_000, analyst_iq: 1_500_000, master_iq: 3_000_000 };

describe("planCostFor", () => {
  it("charges the flat plan price within the seat limit", () => {
    expect(planCostFor("analyst_iq", 10, prices, 100_000)).toEqual({
      plan: "analyst_iq",
      fits: true,
      total: 1_500_000,
      perManager: 150_000,
    });
  });

  it("marks plans that are too small for the team", () => {
    const c = planCostFor("start_iq", 6, prices, 100_000);
    expect(c.fits).toBe(false);
    expect(c.total).toBeNull();
  });

  it("adds extra seats past Master IQ's limit only when they are priced", () => {
    expect(planCostFor("master_iq", 70, prices, 100_000).total).toBe(4_000_000);
    expect(planCostFor("master_iq", 70, prices, 0).fits).toBe(false);
  });

  it("has no total while a price isn't set", () => {
    expect(planCostFor("start_iq", 2, { ...prices, start_iq: 0 }, 0)).toMatchObject({
      fits: true,
      total: null,
    });
  });
});

describe("teamCosts", () => {
  it("returns the plans in order", () => {
    expect(teamCosts(1, prices, 0).map((c) => c.plan)).toEqual([
      "start_iq",
      "analyst_iq",
      "master_iq",
    ]);
  });
});
