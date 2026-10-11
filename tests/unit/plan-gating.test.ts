import {
  SEAT_LIMITS,
  effectivePriceUzs,
  effectiveSeatLimit,
  minPlanForFeature,
  normalizePlan,
  planHasFeature,
} from "@/lib/plan-gating";

describe("plan-gating", () => {
  it("has the 5 / 25 / 60 seat limits", () => {
    expect(SEAT_LIMITS).toEqual({ start_iq: 5, analyst_iq: 25, master_iq: 60 });
  });

  it("puts telephony in Analyst IQ and up, not in Start IQ", () => {
    expect(planHasFeature("start_iq", "telephony")).toBe(false);
    expect(planHasFeature("analyst_iq", "telephony")).toBe(true);
    expect(planHasFeature("master_iq", "telephony")).toBe(true);
    expect(minPlanForFeature("telephony")).toBe("analyst_iq");
  });

  it("keeps automation and e-signature Master-only", () => {
    expect(planHasFeature("analyst_iq", "automation")).toBe(false);
    expect(planHasFeature("master_iq", "automation")).toBe(true);
    expect(minPlanForFeature("esignature")).toBe("master_iq");
  });

  it("treats unknown or empty plans as Start IQ", () => {
    expect(normalizePlan(undefined)).toBe("start_iq");
    expect(normalizePlan("enterprise")).toBe("start_iq");
    expect(planHasFeature(null, "analytics")).toBe(false);
  });

  it("adds extra seats, ignores negative ones, and honours unlimited seats", () => {
    expect(effectiveSeatLimit("analyst_iq", 3)).toBe(28);
    expect(effectiveSeatLimit("start_iq", -4)).toBe(5);
    expect(effectiveSeatLimit("master_iq", 10, true)).toBeNull();
  });

  it("prices extra seats on top of the plan", () => {
    const prices = { start_iq: 100, analyst_iq: 200, master_iq: 300 };
    expect(effectivePriceUzs("analyst_iq", 2, prices, 15)).toBe(230);
    expect(effectivePriceUzs("bogus", 0, prices, 15)).toBe(100);
  });
});
