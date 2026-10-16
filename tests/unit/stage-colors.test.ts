import {
  STAGE_PALETTE,
  hasRepeatedColors,
  nextStageColor,
  spreadStageColors,
} from "@/lib/stage-colors";

describe("stage colors", () => {
  it("has 20 different colors", () => {
    expect(new Set(STAGE_PALETTE).size).toBe(20);
  });
  it("gives a new stage a color its siblings don't have", () => {
    expect(nextStageColor([])).toBe(STAGE_PALETTE[0]);
    expect(nextStageColor(["#3B82F6", "bg-primary"])).toBe(STAGE_PALETTE[1]);
    const all = [...STAGE_PALETTE, STAGE_PALETTE[0]];
    expect(nextStageColor(all)).toBe(STAGE_PALETTE[1]);
  });
  it("spots repeated colors and spreads them apart", () => {
    expect(hasRepeatedColors(["bg-primary", "bg-primary"])).toBe(true);
    expect(hasRepeatedColors(["#3b82f6", "#3B82F6"])).toBe(true);
    expect(hasRepeatedColors(["#3b82f6", "#f59e0b", null])).toBe(false);
    const spread = spreadStageColors(6);
    expect(new Set(spread).size).toBe(6);
  });
});
