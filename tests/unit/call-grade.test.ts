import { gradeCounts, gradeOf, gradeRange, stageMarks, timestampSeconds } from "@/lib/call-grade";

describe("gradeOf", () => {
  it("maps a score to a school letter", () => {
    expect(gradeOf(100)).toBe("A");
    expect(gradeOf(80)).toBe("A");
    expect(gradeOf(79)).toBe("B");
    expect(gradeOf(60)).toBe("B");
    expect(gradeOf(59)).toBe("C");
    expect(gradeOf(40)).toBe("C");
    expect(gradeOf(39)).toBe("D");
    expect(gradeOf(0)).toBe("D");
  });

  it("keeps each grade's range consistent with the letter", () => {
    for (const s of [0, 39, 40, 59, 60, 79, 80, 100]) {
      const r = gradeRange(gradeOf(s));
      expect(s >= r.min && s <= r.max).toBe(true);
    }
  });

  it("counts grades, skipping unscored calls", () => {
    expect(gradeCounts([90, 85, 70, 45, 10, null, undefined])).toEqual({ A: 2, B: 1, C: 1, D: 1 });
  });
});

describe("stageMarks", () => {
  it("gives each stage a points-weighted mark out of 5, in rubric order", () => {
    const marks = stageMarks([
      { stage: "Salomlashish", points: 2, met: true },
      { stage: "Salomlashish", points: 2, met: true },
      { stage: "Ehtiyoj", points: 3, met: true },
      { stage: "Ehtiyoj", points: 1, met: false },
      { stage: "Yopish", points: 5, met: false },
    ]);
    expect(marks).toEqual([
      { stage: "Salomlashish", mark: 5, pct: 100, met: 2, total: 2 },
      { stage: "Ehtiyoj", mark: 4, pct: 75, met: 1, total: 2 },
      { stage: "Yopish", mark: 0, pct: 0, met: 0, total: 1 },
    ]);
  });

  it("weighs items equally without points and groups a missing stage", () => {
    expect(stageMarks([{ met: true }, { met: false }])).toEqual([
      { stage: "—", mark: 3, pct: 50, met: 1, total: 2 },
    ]);
    expect(stageMarks(null)).toEqual([]);
  });
});

describe("timestampSeconds", () => {
  it("reads mm:ss and [mm:ss]", () => {
    expect(timestampSeconds("03:58")).toBe(238);
    expect(timestampSeconds("[1:02]")).toBe(62);
    expect(timestampSeconds("1:02:03")).toBe(3723);
    expect(timestampSeconds(null)).toBeNull();
    expect(timestampSeconds("soon")).toBeNull();
  });
});
