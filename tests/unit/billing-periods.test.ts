import { bonusMonths, isBillingMonths, periodAmount, periodDays } from "@/lib/billing-periods";

describe("billing periods", () => {
  it("adds free months to long periods only", () => {
    expect([1, 3, 6, 9, 12].map(bonusMonths)).toEqual([0, 0, 0, 1, 2]);
    expect(periodDays(1)).toBe(30);
    expect(periodDays(9)).toBe(300);
    expect(periodDays(12)).toBe(420);
  });
  it("charges the paid months and rejects other lengths", () => {
    expect(periodAmount(100_000, 12)).toBe(1_200_000);
    expect(isBillingMonths(5)).toBe(false);
    expect(periodAmount(100_000, 5)).toBe(100_000);
    expect(periodDays(7)).toBe(30);
  });
});
