import {
  AUTO_COLORS_DEFAULT,
  autoCardState,
  parseAutoColors,
  withAutoColors,
} from "@/lib/lead-colors";

const now = new Date(2026, 10, 25, 12, 0, 0);
const lead = (p: Partial<{ due: string | null; won: boolean; lost: boolean }>) => ({
  nextFollowUpIso: p.due ?? null,
  stageIsWon: !!p.won,
  stageIsLost: !!p.lost,
});

describe("autoCardState", () => {
  it("reads the task and the outcome", () => {
    const on = AUTO_COLORS_DEFAULT;
    expect(autoCardState(lead({ due: new Date(2026, 10, 25, 18).toISOString() }), on, now)).toBe(
      "today",
    );
    expect(autoCardState(lead({ due: new Date(2026, 10, 25, 9).toISOString() }), on, now)).toBe(
      "overdue",
    );
    expect(autoCardState(lead({ due: new Date(2026, 10, 27, 9).toISOString() }), on, now)).toBe(
      null,
    );
    expect(autoCardState(lead({}), on, now)).toBe(null);
    expect(autoCardState(lead({ won: true, due: "2020-01-01T00:00:00Z" }), on, now)).toBe("won");
    expect(autoCardState(lead({ lost: true }), on, now)).toBe("lost");
  });

  it("respects the switches", () => {
    const off = { ...AUTO_COLORS_DEFAULT, overdue: false, won: false };
    expect(autoCardState(lead({ due: new Date(2026, 10, 25, 9).toISOString() }), off, now)).toBe(
      null,
    );
    expect(autoCardState(lead({ won: true }), off, now)).toBe(null);
  });
});

describe("auto colour settings", () => {
  it("defaults to on and saves per funnel", () => {
    expect(parseAutoColors(null, "A")).toEqual(AUTO_COLORS_DEFAULT);
    const saved = withAutoColors({ colorRules: [] }, "A", { ...AUTO_COLORS_DEFAULT, lost: false });
    expect(saved["colorRules"]).toEqual([]);
    expect(parseAutoColors(saved, "A").lost).toBe(false);
    expect(parseAutoColors(saved, "B").lost).toBe(true);
  });
});
