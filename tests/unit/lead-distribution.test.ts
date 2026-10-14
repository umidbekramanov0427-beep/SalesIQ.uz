import { dealOut, pickIndices, pickLeads, stepRange } from "@/lib/lead-distribution";

describe("pickIndices", () => {
  it("takes from the start, the end and the middle", () => {
    expect(pickIndices(10, 3, "start")).toEqual([0, 1, 2]);
    expect(pickIndices(10, 3, "end")).toEqual([7, 8, 9]);
    expect(pickIndices(10, 4, "middle")).toEqual([3, 4, 5, 6]);
  });

  it("takes every second lead from the start, the middle and the end", () => {
    expect(pickIndices(10, 3, "everyOtherStart")).toEqual([0, 2, 4]);
    expect(pickIndices(10, 3, "everyOtherEnd")).toEqual([5, 7, 9]);
    // A 5-wide window centred in 0..10: positions 2..6, every second.
    expect(pickIndices(11, 3, "everyOtherMiddle")).toEqual([3, 5, 7]);
  });

  it("splits start / middle / end evenly", () => {
    expect(pickIndices(30, 9, "startMiddleEnd")).toEqual([0, 1, 2, 13, 14, 15, 27, 28, 29]);
    // 10 = 4 + 3 + 3, the start takes the remainder.
    const ten = pickIndices(30, 10, "startMiddleEnd");
    expect(ten).toHaveLength(10);
    expect(ten.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(ten.slice(-3)).toEqual([27, 28, 29]);
  });

  it("never picks more than the column has, nor the same lead twice", () => {
    expect(pickIndices(4, 10, "start")).toEqual([0, 1, 2, 3]);
    expect(pickIndices(4, 10, "startMiddleEnd")).toEqual([0, 1, 2, 3]);
    expect(pickIndices(7, 10, "everyOtherStart")).toEqual([0, 2, 4, 6]);
    expect(pickIndices(0, 5, "middle")).toEqual([]);
    for (const p of ["start", "end", "middle", "startMiddleEnd"] as const) {
      const idx = pickIndices(25, 12, p);
      expect(new Set(idx).size).toBe(12);
      expect(idx.every((i) => i >= 0 && i < 25)).toBe(true);
    }
  });

  it("keeps the column order when picking leads", () => {
    expect(pickLeads(["a", "b", "c", "d", "e"], 2, "everyOtherEnd")).toEqual(["c", "e"]);
  });
});

describe("dealOut", () => {
  it("deals leads in turn so everyone gets the same number, give or take one", () => {
    const out = dealOut([1, 2, 3, 4, 5], ["x", "y"]);
    expect(out.get("x")).toEqual([1, 3, 5]);
    expect(out.get("y")).toEqual([2, 4]);
  });
  it("gives nothing when nobody is picked", () => {
    expect(dealOut([1, 2], []).size).toBe(0);
  });
});

describe("stepRange", () => {
  it("takes the first N or the k-th group of N", () => {
    expect(stepRange(50, "first", 10)).toEqual({ start: 0, end: 10 });
    expect(stepRange(50, "g1", 10)).toEqual({ start: 0, end: 10 });
    expect(stepRange(50, "g2", 10)).toEqual({ start: 10, end: 20 });
    expect(stepRange(50, "g3", 15)).toEqual({ start: 30, end: 45 });
    expect(stepRange(50, "gN", 10, 5)).toEqual({ start: 40, end: 50 });
  });
  it("stops at the end of the column", () => {
    expect(stepRange(25, "g3", 10)).toEqual({ start: 20, end: 25 });
    expect(stepRange(25, "gN", 10, 4)).toEqual({ start: 25, end: 25 });
  });
});
