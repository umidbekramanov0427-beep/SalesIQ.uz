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
