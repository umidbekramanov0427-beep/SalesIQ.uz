import {
  campaignOf,
  canUseCrm,
  canUseMarketing,
  leadsByDay,
  qualityBy,
  type QLead,
} from "@/lib/marketing";

const r = { from: "2026-10-31T19:00:00.000Z", to: "2026-11-03T19:00:00.000Z" }; // 1-3 Nov, Tashkent
const lead = (x: Partial<QLead>): QLead => ({
  source: null,
  campaign: null,
  utm: null,
  created_at: "2026-11-01T08:00:00Z",
  stage_changed_at: null,
  budget: 0,
  won: false,
  lost: false,
  score: null,
  temperature: null,
  ...x,
});

describe("marketing", () => {
  it("lets admins, marketologs and invited people in", () => {
    expect(canUseMarketing({ role: "super_admin" })).toBe(true);
    expect(canUseMarketing({ role: "marketolog" })).toBe(true);
    expect(canUseMarketing({ role: "rop" })).toBe(false);
    expect(canUseMarketing({ role: "sotuv_menejeri", marketingAccess: true })).toBe(true);
    expect(canUseMarketing(null)).toBe(false);
    expect(canUseCrm({ role: "marketolog" })).toBe(false);
    expect(canUseCrm({ role: "rop" })).toBe(true);
  });

  it("reads the campaign from the lead or its UTM", () => {
    expect(campaignOf({ campaign: " Kuz aksiyasi ", utm: null })).toBe("Kuz aksiyasi");
    expect(campaignOf({ campaign: null, utm: { utm_campaign: "webinar_12" } })).toBe("webinar_12");
    expect(campaignOf({ campaign: "", utm: ["x"] })).toBeNull();
  });

  it("groups lead quality by source", () => {
    const leads = [
      lead({ source: "Instagram", score: 80, temperature: "Hot", won: true, budget: 5_000_000 }),
      lead({ source: "Instagram", score: 40, temperature: "Warm", lost: true }),
      lead({ source: "Instagram", temperature: "Cold" }),
      lead({ source: "Sayt", score: 90, temperature: "VeryHot" }),
      lead({ source: "Sayt", created_at: "2026-10-20T08:00:00Z", score: 10 }), // outside
    ];
    const { rows, total } = qualityBy(leads, r, (l) => l.source);
    expect(rows[0]).toEqual({
      key: "Instagram",
      leads: 3,
      scored: 2,
      avgScore: 60,
      hot: 1,
      warm: 1,
      cold: 1,
      won: 1,
      lost: 1,
      conversion: 33.3,
      revenue: 5_000_000,
    });
    expect(rows[1]!.avgScore).toBe(90);
    expect(total.leads).toBe(4);
    expect(total.avgScore).toBe(70);
    expect(total.hot).toBe(2);
  });

  it("counts new leads per day", () => {
    const days = leadsByDay(
      [
        lead({ created_at: "2026-11-01T08:00:00Z", temperature: "Hot" }),
        lead({ created_at: "2026-11-01T20:30:00Z" }), // 2 Nov in Tashkent
        lead({ created_at: "2026-11-03T10:00:00Z" }),
      ],
      r,
    );
    expect(days).toEqual([
      { day: "2026-11-01", leads: 1, hot: 1 },
      { day: "2026-11-02", leads: 1, hot: 0 },
      { day: "2026-11-03", leads: 1, hot: 0 },
    ]);
  });
});
