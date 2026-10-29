import { computeStageGrid, dailyShare } from "@/lib/stage-plan";

const monthStart = new Date(2026, 9, 1); // October 2026, local
const at = (day: number, h = 10) => new Date(2026, 9, day, h).toISOString();

describe("stage plan grid", () => {
  it("spreads a month's plan over its days without losing any", () => {
    let sum = 0;
    for (let d = 1; d <= 31; d++) sum += dailyShare(93, 31, d);
    expect(sum).toBe(93);
    expect(dailyShare(93, 31, 1)).toBe(3);
  });

  it("counts entries per day, marks today and works out what is still needed", () => {
    const [row] = computeStageGrid({
      monthStart,
      days: 31,
      stages: [{ id: "s1", name: "Gaplashildi" }],
      events: [
        { stage_id: "s1", entered_at: at(1) },
        { stage_id: "s1", entered_at: at(1, 15) },
        { stage_id: "s1", entered_at: at(2) },
        { stage_id: "other", entered_at: at(2) },
        { stage_id: "s1", entered_at: new Date(2026, 10, 1, 9).toISOString() },
      ],
      targets: new Map([["s1", 31]]),
      now: new Date(2026, 9, 3, 12),
    });
    expect(row!.cells[0]).toMatchObject({ day: 1, kind: "past", fact: 2, plan: 1 });
    expect(row!.cells[2]!.kind).toBe("today");
    expect(row!.cells[3]!.kind).toBe("future");
    // 3 done of 31; 28 days ahead -> 1 a day.
    expect(row!.cells[3]!.needed).toBe(1);
    expect(row!.total).toBe(3);
    expect(row!.pct).toBe(10);
    expect(row!.forecast).toBe(31);
  });

  it("has no percentage without a plan", () => {
    const [row] = computeStageGrid({
      monthStart,
      days: 31,
      stages: [{ id: "s1", name: "x" }],
      events: [],
      targets: new Map(),
      now: new Date(2026, 9, 10),
    });
    expect(row!.pct).toBeNull();
    expect(row!.cells.every((c) => c.plan === 0)).toBe(true);
  });
});
