import { stageValueOf, stageValueOverrides } from "@/lib/stage-value";

describe("stage value", () => {
  const open = { is_won: false, is_lost: false };
  const won = { is_won: true, is_lost: false };
  const lost = { is_won: false, is_lost: true };

  it("«Sotuv» on an open stage makes the reports count it as won", () => {
    expect(stageValueOverrides(open, "sale")).toEqual({
      counts_as_won_override: true,
      counts_as_lost_override: null,
    });
    expect(stageValueOverrides(open, "refused")).toEqual({
      counts_as_won_override: null,
      counts_as_lost_override: true,
    });
    expect(stageValueOverrides(open, "expected")).toEqual({
      counts_as_won_override: null,
      counts_as_lost_override: null,
    });
  });

  it("won / lost stages keep their own meaning unless set otherwise", () => {
    expect(stageValueOverrides(won, "sale").counts_as_won_override).toBeNull();
    expect(stageValueOverrides(won, "advance").counts_as_won_override).toBe(false);
    expect(stageValueOverrides(lost, "refused").counts_as_lost_override).toBeNull();
  });

  it("reads the overrides back when no value was saved", () => {
    expect(stageValueOf({ ...open, position: 2, counts_as_won_override: true })).toBe("sale");
    expect(stageValueOf({ ...open, position: 2, counts_as_lost_override: true })).toBe("refused");
    expect(stageValueOf({ ...open, position: 0 })).toBe("new");
  });
});
