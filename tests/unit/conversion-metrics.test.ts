import { conversionMetrics, stageRoles, type ConversionStage } from "@/lib/conversion-metrics";

const st = (
  id: string,
  name: string,
  position: number,
  extra: Partial<ConversionStage> = {},
): ConversionStage => ({
  id,
  name,
  pipeline_name: "Sotuv",
  position,
  is_won: false,
  is_lost: false,
  ...extra,
});

const STAGES = [
  st("new", "Неразобранное", 0),
  st("call", "Bog'lanib bo'lmadi", 1),
  st("wrong", "Raqami yo'q", 2),
  st("talk", "Suhbat bo'ldi", 3),
  st("pre", "Peredoplata", 4),
  st("half", "Yarim to'lov", 5),
  st("full", "To'liq to'lov qildi", 6),
  st("won", "Успешно реализовано", 7, { is_won: true }),
  st("lost", "Закрыто и не реализовано", 8, { is_lost: true }),
];

describe("stageRoles", () => {
  it("reads each stage's role from its name", () => {
    const roles = stageRoles(STAGES);
    expect(roles.get("new")).toBe("new");
    expect(roles.get("call")).toBe("unreachable");
    expect(roles.get("wrong")).toBe("wrongNumber");
    expect(roles.get("talk")).toBe("open");
    expect(roles.get("pre")).toBe("partial");
    expect(roles.get("half")).toBe("partial");
    expect(roles.get("full")).toBe("full");
    expect(roles.get("won")).toBe("full");
    expect(roles.get("lost")).toBe("lost");
  });

  it("treats the first stage of every pipeline as new", () => {
    const roles = stageRoles([
      { ...st("a1", "Kirish", 0), pipeline_name: "A" },
      { ...st("a2", "Suhbat", 1), pipeline_name: "A" },
      { ...st("b1", "Ariza", 3), pipeline_name: "B" },
    ]);
    expect(roles.get("a1")).toBe("new");
    expect(roles.get("a2")).toBe("open");
    expect(roles.get("b1")).toBe("new");
  });
});

describe("conversionMetrics", () => {
  const counts = [
    { stage_id: "new", n: 10 },
    { stage_id: "call", n: 15 },
    { stage_id: "wrong", n: 5 },
    { stage_id: "talk", n: 30 },
    { stage_id: "pre", n: 6 },
    { stage_id: "half", n: 4 },
    { stage_id: "full", n: 8 },
    { stage_id: "won", n: 2 },
    { stage_id: "lost", n: 20 },
  ];
  const m = conversionMetrics(counts, STAGES);

  it("counts every payment stage as a sale", () => {
    expect(m.overall).toEqual({ num: 20, den: 100, pct: 20 });
  });

  it("leaves out no-number and lost leads for the qualified rate", () => {
    expect(m.qualified).toEqual({ num: 20, den: 75, pct: 26.7 });
  });

  it("leaves out wrong number, new and unreachable leads for the reached rate", () => {
    expect(m.connected).toEqual({ num: 20, den: 70, pct: 28.6 });
  });

  it("measures prepayment / half payment turning into full payment", () => {
    expect(m.partialToFull).toEqual({ num: 10, den: 20, pct: 50 });
  });

  it("names the stages behind each exclusion", () => {
    expect(m.names.wrongNumber).toEqual(["Raqami yo'q"]);
    expect(m.names.unreachable).toEqual(["Bog'lanib bo'lmadi"]);
    expect(m.names.partial).toEqual(["Peredoplata", "Yarim to'lov"]);
  });

  it("is zero, not NaN, with no leads", () => {
    const empty = conversionMetrics([], STAGES);
    expect(empty.overall.pct).toBe(0);
    expect(empty.partialToFull.pct).toBe(0);
  });
});
