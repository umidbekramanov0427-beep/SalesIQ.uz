import {
  objectionKind,
  objectionLibrary,
  scoreBands,
  stageGaps,
  type InsightCall,
  type InsightLead,
} from "@/lib/sales-insights";

const call = (
  leadId: string,
  score: number,
  met: Record<string, boolean> = {},
  objections: InsightCall["objections"] = [],
): InsightCall => ({
  leadId,
  score,
  checklist: Object.entries(met).map(([stage, m]) => ({ stage, met: m })),
  objections,
});

describe("scoreBands", () => {
  it("bands leads by their average call score and counts sales", () => {
    const leads: InsightLead[] = [
      { id: "a", ownerId: "m1", outcome: "won" },
      { id: "b", ownerId: "m1", outcome: "lost" },
      { id: "c", ownerId: "m2", outcome: "won" },
      { id: "d", ownerId: "m2", outcome: "open" },
    ];
    const calls = [
      call("a", 90),
      call("a", 80),
      call("b", 30),
      call("c", 70),
      call("d", 85),
      call("x", 50),
    ];
    const bands = scoreBands(calls, leads);
    expect(bands.find((b) => b.key === "80-100")).toMatchObject({
      leads: 2,
      won: 1,
      open: 1,
      conversion: 100,
    });
    expect(bands.find((b) => b.key === "0-39")).toMatchObject({ leads: 1, lost: 1, conversion: 0 });
    expect(bands.find((b) => b.key === "60-79")).toMatchObject({ leads: 1, won: 1 });
    expect(bands.find((b) => b.key === "40-59")).toMatchObject({ leads: 0, conversion: null });
  });
});

describe("stageGaps", () => {
  it("finds the step done in won deals but skipped in lost ones", () => {
    const leads: InsightLead[] = [
      ...["w1", "w2", "w3"].map((id) => ({ id, ownerId: null, outcome: "won" as const })),
      ...["l1", "l2", "l3"].map((id) => ({ id, ownerId: null, outcome: "lost" as const })),
    ];
    const calls = [
      call("w1", 80, { Ehtiyoj: true, Yopish: true }),
      call("w2", 80, { Ehtiyoj: true, Yopish: true }),
      call("w3", 80, { Ehtiyoj: true, Yopish: false }),
      call("l1", 40, { Ehtiyoj: true, Yopish: false }),
      call("l2", 40, { Ehtiyoj: true, Yopish: false }),
      call("l3", 40, { Ehtiyoj: false, Yopish: false }),
    ];
    const gaps = stageGaps(calls, leads);
    expect(gaps[0]).toMatchObject({ stage: "Yopish", wonRate: 67, lostRate: 0, gap: 67 });
    expect(gaps[1]).toMatchObject({ stage: "Ehtiyoj", wonRate: 100, lostRate: 67 });
  });
  it("leaves out steps with too few calls", () => {
    const leads: InsightLead[] = [
      { id: "w", ownerId: null, outcome: "won" },
      { id: "l", ownerId: null, outcome: "lost" },
    ];
    expect(stageGaps([call("w", 80, { A: true }), call("l", 40, { A: false })], leads)).toEqual([]);
  });
});

describe("objections", () => {
  it("recognises the common kinds in Uzbek and Russian", () => {
    expect(objectionKind("Bu juda qimmat ekan")).toBe("price");
    expect(objectionKind("Дорого для меня")).toBe("price");
    expect(objectionKind("O'ylab ko'raman")).toBe("think");
    expect(objectionKind("Eri bilan maslahatlashishi kerak")).toBe("consult");
    expect(objectionKind("Natijasiga ishonmayman")).toBe("trust");
    expect(objectionKind("Hozir kerak emas")).toBe("need");
    expect(objectionKind("Hozir vaqtim yo'q")).toBe("time");
    expect(objectionKind("Bilmadim")).toBe("other");
  });
  it("collects the best answers, sold deals first, without repeats", () => {
    const leads: InsightLead[] = [
      { id: "w", ownerId: "m1", outcome: "won" },
      { id: "l", ownerId: "m2", outcome: "lost" },
    ];
    const good = "Bo'lib to'lash mumkin, oyiga 500 ming";
    const calls = [
      call("l", 95, {}, [
        {
          objection: "Qimmat",
          managerResponse: "Chegirma beramiz, ertaga",
          handled: true,
          betterResponse: "",
        },
      ]),
      call("w", 70, {}, [
        { objection: "Narxi baland", managerResponse: good, handled: true, betterResponse: "" },
      ]),
      call("w", 70, {}, [
        { objection: "Qimmat ekan", managerResponse: good, handled: true, betterResponse: "" },
      ]),
      call("l", 30, {}, [
        {
          objection: "Pul yo'q",
          managerResponse: "Xo'p",
          handled: false,
          betterResponse: "Qiymatini tushuntiring",
        },
      ]),
    ];
    const [price] = objectionLibrary(calls, leads);
    expect(price).toMatchObject({ kind: "price", count: 4, handledRate: 75, wonRate: 50 });
    expect(price!.best.map((b) => b.response)).toEqual([good, "Chegirma beramiz, ertaga"]);
    expect(price!.best[0]).toMatchObject({ ownerId: "m1", won: true });
    expect(price!.suggestion).toBe("Qiymatini tushuntiring");
  });
});
