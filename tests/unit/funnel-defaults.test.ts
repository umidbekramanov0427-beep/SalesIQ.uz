import { DEFAULT_FUNNEL_STAGES, isClosingStage, missingDefaultStages } from "@/lib/funnel-defaults";
import { en } from "@/lib/i18n-en";

describe("funnel default stages", () => {
  it("opens like amoCRM: unsorted first, one won and one lost at the end", () => {
    const s = DEFAULT_FUNNEL_STAGES;
    expect(s.length).toBe(7);
    expect(isClosingStage(s[0]!)).toBe(false);
    expect(s.filter((x) => x.is_won).length).toBe(1);
    expect(s.filter((x) => x.is_lost).length).toBe(1);
    expect(s.slice(-2).every(isClosingStage)).toBe(true);
    expect(s.find((x) => x.is_won)!.probability).toBe(100);
    expect(s.find((x) => x.is_lost)!.probability).toBe(0);
  });

  it("every stage name has a translation", () => {
    for (const d of DEFAULT_FUNNEL_STAGES) expect(en[d.nameKey]).toBeTruthy();
  });

  it("fills an empty funnel and adds only the missing closing stages", () => {
    expect(missingDefaultStages([]).length).toBe(7);
    const open = { is_won: false, is_lost: false };
    expect(missingDefaultStages([open]).map((d) => d.nameKey)).toEqual([
      "fs.def.won",
      "fs.def.lost",
    ]);
    expect(
      missingDefaultStages([open, { is_won: true, is_lost: false }]).map((d) => d.nameKey),
    ).toEqual(["fs.def.lost"]);
    expect(
      missingDefaultStages([
        open,
        { is_won: true, is_lost: false },
        { is_won: false, is_lost: true },
      ]),
    ).toEqual([]);
  });
});

describe("lead quality in the sales analysis", () => {
  it("counts leads that reached qualified / junk stages", async () => {
    const { salesAnalysis } = await import("@/lib/analytics-reports");
    const r = { from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z" };
    const stages = [
      { id: "a", name: "A", position: 0, is_won: false, is_lost: false, probability: null },
      {
        id: "q",
        name: "Q",
        position: 1,
        is_won: false,
        is_lost: false,
        probability: null,
        quality: "qualified",
      },
      {
        id: "j",
        name: "J",
        position: 2,
        is_won: false,
        is_lost: false,
        probability: null,
        quality: "junk",
      },
    ];
    const lead = (id: string, stage_id: string) => ({
      id,
      owner_id: null,
      stage_id,
      budget: 0,
      created_at: "2026-11-05T00:00:00Z",
      stage_changed_at: "2026-11-06T00:00:00Z",
      loss_reason: null,
      source: null,
    });
    const leads = [lead("1", "q"), lead("2", "a"), lead("3", "j")];
    const events = [{ lead_id: "2", stage_id: "q", entered_at: "2026-11-07T00:00:00Z" }];
    const s = salesAnalysis(leads as never, stages, events, r as never);
    expect(s.quality).toEqual({ qualified: 2, junk: 1 });
    expect(salesAnalysis(leads as never, stages.slice(0, 1), [], r as never).quality).toBeNull();
  });
});
