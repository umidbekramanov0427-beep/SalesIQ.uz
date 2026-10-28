import { coachingVerdict, rateFor, stagesOf, weakSpots, type CoachingCall } from "@/lib/coaching";

const c = (ownerId: string, at: string, stages: Record<string, boolean>): CoachingCall => ({
  ownerId,
  at,
  stages,
});

describe("stagesOf", () => {
  it("counts a stage once per call, done if any of its steps was", () => {
    expect(
      stagesOf([
        { stage: "Yopish", step: "a", met: false },
        { stage: "Yopish", step: "b", met: true },
        { stage: null, step: "Salom", met: true },
        { stage: "", step: "", met: true },
      ]),
    ).toEqual({ Yopish: true, Salom: true });
  });
});

describe("weakSpots", () => {
  it("finds the stage where a manager is furthest below the team", () => {
    const calls: CoachingCall[] = [];
    for (let i = 0; i < 6; i++) {
      calls.push(c("ali", `2026-10-0${i + 1}`, { Ehtiyoj: true, Yopish: i < 1 }));
      calls.push(c("vali", `2026-10-0${i + 1}`, { Ehtiyoj: i < 2, Yopish: true }));
    }
    const spots = weakSpots(calls);
    expect(spots.map((s) => [s.ownerId, s.stage, s.rate])).toEqual([
      ["ali", "Yopish", 17],
      ["vali", "Ehtiyoj", 33],
    ]);
    expect(spots[0]!.teamRate).toBe(58);
  });
  it("skips managers with too few calls or nothing under 70%", () => {
    expect(weakSpots([c("a", "2026-10-01", { X: false })])).toEqual([]);
    const good = Array.from({ length: 5 }, (_, i) => c("a", `2026-10-0${i + 1}`, { X: true }));
    expect(weakSpots(good)).toEqual([]);
  });
});

describe("before and after", () => {
  const calls = [
    c("ali", "2026-10-01", { Yopish: false }),
    c("ali", "2026-10-02", { Yopish: false }),
    c("ali", "2026-10-10", { Yopish: true }),
    c("ali", "2026-10-11", { Yopish: true }),
    c("ali", "2026-10-12", { Yopish: false }),
    c("vali", "2026-10-12", { Yopish: true }),
  ];
  it("measures one manager's stage in a window", () => {
    expect(rateFor(calls, "ali", "Yopish", null, "2026-10-05")).toEqual({
      met: 0,
      total: 2,
      rate: 0,
    });
    expect(rateFor(calls, "ali", "Yopish", "2026-10-05", null)).toEqual({
      met: 2,
      total: 3,
      rate: 67,
    });
  });
  it("says better / worse only once there are enough calls", () => {
    expect(coachingVerdict(0, { met: 2, total: 3, rate: 67 })).toBe("better");
    expect(coachingVerdict(50, { met: 1, total: 2, rate: 50 })).toBe("pending");
    expect(coachingVerdict(80, { met: 1, total: 4, rate: 25 })).toBe("worse");
    expect(coachingVerdict(50, { met: 2, total: 4, rate: 50 })).toBe("same");
  });
});
