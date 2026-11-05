import {
  activity,
  forecast,
  salesAnalysis,
  summaryByOwner,
  winLoss,
  type ALead,
  type AStage,
} from "@/lib/analytics-reports";

const R = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };
const stages: AStage[] = [
  { id: "new", name: "Yangi", position: 1, is_won: false, is_lost: false, probability: 10 },
  { id: "talk", name: "Suhbat", position: 2, is_won: false, is_lost: false, probability: 50 },
  { id: "won", name: "Sotildi", position: 9, is_won: true, is_lost: false, probability: 100 },
  { id: "lost", name: "Yo'qotildi", position: 10, is_won: false, is_lost: true, probability: 0 },
];
const lead = (p: Partial<ALead>): ALead => ({
  id: Math.random().toString(36),
  owner_id: "a",
  stage_id: "new",
  budget: 0,
  created_at: "2026-10-05T10:00:00.000Z",
  stage_changed_at: null,
  loss_reason: null,
  source: null,
  ...p,
});
const leads: ALead[] = [
  lead({
    id: "1",
    stage_id: "won",
    budget: 1000,
    stage_changed_at: "2026-10-15T10:00:00.000Z",
    source: "Instagram",
  }),
  lead({
    id: "2",
    stage_id: "won",
    budget: 3000,
    owner_id: "b",
    stage_changed_at: "2026-10-07T10:00:00.000Z",
    source: "Instagram",
  }),
  lead({
    id: "3",
    stage_id: "lost",
    budget: 500,
    stage_changed_at: "2026-10-20T10:00:00.000Z",
    loss_reason: "Qimmat",
    source: "Sayt",
  }),
  // Won before the period: not counted as a win of this period.
  lead({
    id: "4",
    stage_id: "won",
    budget: 9000,
    created_at: "2026-08-01T00:00:00.000Z",
    stage_changed_at: "2026-09-01T00:00:00.000Z",
  }),
  lead({ id: "5", stage_id: "talk", budget: 2000 }),
  lead({
    id: "6",
    stage_id: "new",
    budget: 100,
    owner_id: "b",
    created_at: "2026-11-02T00:00:00.000Z",
  }),
];

describe("Analitika reports", () => {
  it("sales analysis: new, won, lost, conversion, check, cycle and stage passes", () => {
    const events = [
      { lead_id: "1", stage_id: "new", entered_at: "2026-10-05T10:00:00.000Z" },
      { lead_id: "5", stage_id: "new", entered_at: "2026-10-05T10:00:00.000Z" },
      { lead_id: "2", stage_id: "new", entered_at: "2026-10-05T10:00:00.000Z" },
      { lead_id: "3", stage_id: "new", entered_at: "2026-10-05T10:00:00.000Z" },
      { lead_id: "5", stage_id: "talk", entered_at: "2026-10-06T10:00:00.000Z" },
      { lead_id: "1", stage_id: "talk", entered_at: "2026-10-06T10:00:00.000Z" },
    ];
    const s = salesAnalysis(leads, stages, events, R);
    expect(s.newLeads).toBe(4);
    expect(s.won).toEqual({ count: 2, sum: 4000 });
    expect(s.lost).toEqual({ count: 1, sum: 500 });
    expect(s.conversion).toBe(66.7);
    expect(s.avgCheck).toBe(2000);
    expect(s.avgCycleDays).toBe(6);
    expect(s.stages.map((x) => x.name)).toEqual(["Yangi", "Suhbat", "Sotildi", "Yo'qotildi"]);
    expect(s.stages[1]).toMatchObject({ entered: 2, now: 1, nowSum: 2000, passRate: 50 });
  });

  it("summary per manager sorts by won sum and keeps activity counts", () => {
    const rows = summaryByOwner(leads, stages, R, { calls: new Map([["a", 7]]) });
    expect(rows[0]).toMatchObject({ ownerId: "b", won: 1, wonSum: 3000, conversion: 100 });
    expect(rows[1]).toMatchObject({
      ownerId: "a",
      won: 1,
      lost: 1,
      open: 1,
      calls: 7,
      conversion: 50,
    });
  });

  it("win-loss groups reasons and sources", () => {
    const w = winLoss(leads, stages, R);
    expect(w).toMatchObject({ won: 2, lost: 1 });
    expect(w.lostByReason).toEqual([{ reason: "Qimmat", count: 1, sum: 500 }]);
    expect(w.bySource[0]).toMatchObject({ source: "Instagram", won: 2, lost: 0, winRate: 100 });
  });

  it("activity counts each person's actions per kind and per local day", () => {
    const a = activity(
      [
        { actor: "a", kind: "calls", at: "2026-10-02T20:00:00.000Z" },
        { actor: "a", kind: "notes", at: "2026-10-02T05:00:00.000Z" },
        { actor: "b", kind: "calls", at: "2026-12-01T00:00:00.000Z" },
      ],
      R,
    );
    expect(a.days.length).toBe(31);
    expect(a.people).toHaveLength(1);
    // 20:00 UTC is already the next day in Tashkent (+5).
    expect(a.people[0]!.perDay).toEqual({ "2026-10-03": 1, "2026-10-02": 1 });
  });

  it("forecast weights open budgets by stage probability", () => {
    const f = forecast(leads, stages);
    expect(f.total).toEqual({ count: 2, sum: 2100, weighted: 1010 });
    expect(f.stages.map((s) => s.weighted)).toEqual([10, 1000]);
  });
});
