import { leadInProject, parseList, projectOfLead, shotsSummary } from "@/lib/marketing-projects";

describe("marketing projects", () => {
  const english = { id: "a", funnels: ["Ingliz tili"], utm_campaigns: ["kuz_aksiyasi"] };
  const math = { id: "b", funnels: ["Matematika"], utm_campaigns: [] };

  it("puts a lead in a project by its funnel or its UTM campaign", () => {
    expect(leadInProject({ funnel: " ingliz  TILI", campaign: null, utm: null }, english)).toBe(
      true,
    );
    expect(
      leadInProject(
        { funnel: "Boshqa", campaign: null, utm: { utm_campaign: "Kuz_Aksiyasi" } },
        english,
      ),
    ).toBe(true);
    expect(leadInProject({ funnel: "Boshqa", campaign: "yoz", utm: null }, english)).toBe(false);
    expect(
      projectOfLead({ funnel: "Matematika", campaign: null, utm: null }, [english, math])?.id,
    ).toBe("b");
    expect(projectOfLead({ funnel: null, campaign: null, utm: null }, [english, math])).toBeNull();
  });

  it("cleans a typed list", () => {
    expect(parseList("Kurslar, kurslar\nSotuv ,  ")).toEqual(["Kurslar", "Sotuv"]);
  });

  it("sums up a group of screenshots", () => {
    const s = shotsSummary([
      { at: "2026-11-12T14:10:00Z", viewers: 5600 },
      { at: "2026-11-12T14:00:00Z", viewers: 5200 },
      { at: "2026-11-12T14:05:00Z", viewers: null },
    ]);
    expect(s).toEqual({
      count: 3,
      from: "2026-11-12T14:00:00Z",
      to: "2026-11-12T14:10:00Z",
      peak: { viewers: 5600, at: "2026-11-12T14:10:00Z" },
      avg: 5400,
    });
  });
});
