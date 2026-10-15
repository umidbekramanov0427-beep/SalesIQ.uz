import { pickDefaultStage, type StageCandidate } from "@/lib/leads/default-stage";

const st = (
  id: string,
  funnel: string,
  position: number,
  key: string | null = null,
): StageCandidate => ({
  id,
  pipeline_name: funnel,
  position,
  key,
});

describe("pickDefaultStage", () => {
  it("takes the stage keyed 'new' when there is one", () => {
    const stages = [st("a", "Sales", 0), st("b", "Sales", 1, "new")];
    expect(pickDefaultStage(stages, {})?.id).toBe("b");
  });

  it("otherwise takes the first stage of the funnel with the most leads", () => {
    const stages = [
      st("sample-1", "Sample", 0),
      st("sales-2", "Sales", 2),
      st("sales-1", "Sales", 1),
    ];
    expect(pickDefaultStage(stages, { Sample: 3, Sales: 100 })?.id).toBe("sales-1");
  });

  it("falls back to the first stage when no funnel has leads", () => {
    const stages = [st("sales-1", "Sales", 1), st("sample-1", "Sample", 0)];
    expect(pickDefaultStage(stages, {})?.id).toBe("sample-1");
  });

  it("is null for a company without stages", () => {
    expect(pickDefaultStage([], {})).toBeNull();
  });
});
