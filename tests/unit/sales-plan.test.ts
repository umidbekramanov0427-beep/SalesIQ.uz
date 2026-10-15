import { monthKey, monthRange, planProgress, shiftMonth } from "@/lib/sales-plan";

describe("months", () => {
  it("keys and ranges", () => {
    expect(monthKey(new Date(2026, 9, 16))).toBe("2026-10-01");
    expect(monthRange("2026-02-01").days).toBe(28);
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });
});

describe("planProgress", () => {
  const mid = new Date(2026, 9, 16, 12); // day 16 of 31
  it("forecasts the month from the pace so far", () => {
    const p = planProgress(31_000_000, 16_000_000, "2026-10-01", mid);
    expect(p.pct).toBe(52);
    expect(p.forecast).toBe(31_000_000);
    expect(p.forecastPct).toBe(100);
    expect(p.status).toBe("on_track");
    expect(p.daysLeft).toBe(15);
    expect(p.perDayNeeded).toBe(1_000_000);
  });
  it("flags falling behind and a finished plan", () => {
    expect(planProgress(31_000_000, 8_000_000, "2026-10-01", mid).status).toBe("behind");
    expect(planProgress(10, 12, "2026-10-01", mid).status).toBe("done");
  });
  it("handles a month without a plan, a past month and a future one", () => {
    expect(planProgress(0, 5, "2026-10-01", mid)).toMatchObject({ pct: null, status: "no_plan" });
    const past = planProgress(100, 40, "2026-09-01", mid);
    expect(past).toMatchObject({ daysLeft: 0, forecast: 40, perDayNeeded: 60, status: "behind" });
    const future = planProgress(100, 0, "2026-11-01", mid);
    expect(future.daysLeft).toBe(30);
    expect(future.perDayNeeded).toBe(4);
  });
});
