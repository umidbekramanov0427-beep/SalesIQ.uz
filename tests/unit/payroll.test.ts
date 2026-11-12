import {
  DEFAULT_PAYROLL,
  computePay,
  isEmptyScheme,
  monthRange,
  parsePayrollRules,
  parseScheme,
  schemeFor,
} from "@/lib/payroll";

describe("payroll", () => {
  it("cleans schemes", () => {
    expect(parsePayrollRules(null)).toEqual(DEFAULT_PAYROLL);
    const s = parseScheme({
      fixed: 3_000_000.4,
      salesPct: 150,
      perSale: -5,
      kpi: [
        { minPct: 120, bonus: 1_000_000 },
        { minPct: 100, bonus: 500_000 },
        { minPct: 0, bonus: 9 },
        { minPct: 80, bonus: 0 },
      ],
      deductFines: false,
    });
    expect(s).toEqual({
      fixed: 3_000_000,
      salesPct: 100,
      perSale: 0,
      kpi: [
        { minPct: 100, bonus: 500_000 },
        { minPct: 120, bonus: 1_000_000 },
      ],
      deductFines: false,
    });
    expect(isEmptyScheme(parseScheme({}))).toBe(true);
  });

  it("uses a person's own scheme before the base one", () => {
    const r = parsePayrollRules({ base: { fixed: 1 }, people: { p: { fixed: 2 } } });
    expect(schemeFor(r, "p").fixed).toBe(2);
    expect(schemeFor(r, "x").fixed).toBe(1);
  });

  it("adds fixed, commission, per sale and the highest KPI step, minus fines", () => {
    const scheme = parseScheme({
      fixed: 3_000_000,
      salesPct: 5,
      perSale: 50_000,
      kpi: [
        { minPct: 100, bonus: 500_000 },
        { minPct: 120, bonus: 1_000_000 },
      ],
    });
    const pay = computePay(scheme, {
      revenue: 40_000_000,
      salesCount: 8,
      planPct: 110,
      fines: 200_000,
    });
    expect(pay).toEqual({
      fixed: 3_000_000,
      commission: 2_000_000,
      perSale: 400_000,
      bonus: 500_000,
      step: { minPct: 100, bonus: 500_000 },
      fines: 200_000,
      total: 5_700_000,
    });
    expect(computePay(scheme, { revenue: 0, salesCount: 0, planPct: null, fines: 0 }).bonus).toBe(
      0,
    );
    expect(
      computePay(
        { ...scheme, deductFines: false },
        {
          revenue: 0,
          salesCount: 0,
          planPct: 0,
          fines: 9e9,
        },
      ).total,
    ).toBe(3_000_000);
    expect(
      computePay(parseScheme({ fixed: 100 }), { revenue: 0, salesCount: 0, planPct: 0, fines: 500 })
        .total,
    ).toBe(0);
  });

  it("spans a whole month", () => {
    const { from, to } = monthRange(2026, 1);
    expect(from.getDate()).toBe(1);
    expect(to.getDate()).toBe(28);
    expect(to.getMonth()).toBe(1);
  });
});
