import { change, computeDesk, deskHistory, deskPeriod, type DeskInput } from "@/lib/desk";

const TZ = 300;
// Tashkent midnight of a day, as an ISO instant.
const day = (ymd: string, hh = 0) =>
  new Date(Date.parse(`${ymd}T${String(hh).padStart(2, "0")}:00:00+05:00`)).toISOString();

function base(over: Partial<DeskInput> = {}): DeskInput {
  return {
    range: { from: day("2026-11-01"), to: day("2026-11-06") },
    prev: { from: day("2026-10-01"), to: day("2026-10-06") },
    now: day("2026-11-05", 14),
    tz: TZ,
    stages: [
      { id: "s1", name: "Yangi", position: 0, won: false, lost: false, funnel: "Sotuv" },
      { id: "s2", name: "Muzokara", position: 1, won: false, lost: false, funnel: "Sotuv" },
      { id: "w", name: "Sotildi", position: 2, won: true, lost: false, funnel: "Sotuv" },
      { id: "x", name: "Yo'qotildi", position: 3, won: false, lost: true, funnel: "Sotuv" },
    ],
    funnels: ["Sotuv"],
    funnel: null,
    people: [
      { id: "a", name: "Ali", role: "sotuv_menejeri" },
      { id: "b", name: "Bek", role: "sotuv_menejeri" },
    ],
    sales: [],
    contactWins: [],
    leads: [],
    stageEvents: [],
    calls: [],
    plans: [],
    planMonth: "2026-11-01",
    ...over,
  };
}

const sale = (
  id: string,
  at: string,
  revenue: number,
  more: Partial<DeskInput["sales"][0]> = {},
) => ({
  id,
  owner_id: "a",
  contact_id: null,
  source: "Instagram",
  funnel: "Sotuv",
  revenue,
  at,
  ...more,
});

describe("Ish stoli", () => {
  it("sums the period, the period before, today and yesterday until now", () => {
    const d = computeDesk(
      base({
        sales: [
          sale("1", day("2026-11-02", 10), 1_000_000),
          sale("2", day("2026-11-05", 9), 500_000),
          sale("3", day("2026-11-04", 11), 300_000),
          sale("4", day("2026-11-04", 16), 200_000), // yesterday after 14:00
          sale("5", day("2026-10-03", 12), 400_000),
        ],
      }),
    );
    expect(d.revenue).toEqual({ cur: 2_000_000, prev: 400_000 });
    expect(d.count).toEqual({ cur: 4, prev: 1 });
    expect(d.avgCheck.cur).toBe(500_000);
    expect(d.today).toMatchObject({
      revenue: 500_000,
      count: 1,
      yRevenue: 300_000,
      until: "14:00",
    });
    expect(change(d.revenue)).toBe(400);
  });

  it("tells new clients from repeat sales by the contact's first win", () => {
    const d = computeDesk(
      base({
        sales: [
          sale("1", day("2026-11-02"), 100, { contact_id: "c1" }),
          sale("2", day("2026-11-03"), 100, { contact_id: "c2" }),
          sale("3", day("2026-11-04"), 100, { contact_id: "c1" }),
        ],
        contactWins: [{ id: "old", contact_id: "c2", at: day("2026-05-01") }],
      }),
    );
    expect(d.newClients.cur).toBe(1);
    expect(d.repeat.cur).toBe(2);
  });

  it("counts conversion of the period's leads and the funnel's stages", () => {
    const leads = [
      {
        id: "l1",
        owner_id: "a",
        stage_id: "w",
        funnel: "Sotuv",
        source: "Sayt",
        created_at: day("2026-11-02"),
      },
      {
        id: "l2",
        owner_id: "a",
        stage_id: "s2",
        funnel: "Sotuv",
        source: "Sayt",
        created_at: day("2026-11-02"),
      },
      {
        id: "l3",
        owner_id: "b",
        stage_id: "x",
        funnel: "Sotuv",
        source: null,
        created_at: day("2026-11-03"),
      },
      {
        id: "l4",
        owner_id: "b",
        stage_id: "s1",
        funnel: "Sotuv",
        source: null,
        created_at: day("2026-11-03"),
      },
    ];
    const d = computeDesk(
      base({ funnel: "Sotuv", leads, stageEvents: [{ lead_id: "l3", stage_id: "s2" }] }),
    );
    expect(d.conversion.cur).toBe(25);
    expect(d.sources).toEqual([
      { name: "Sayt", leads: 2 },
      { name: "—", leads: 2 },
    ]);
    const counts = Object.fromEntries(d.funnelBars.stages.map((s) => [s.name, s.count]));
    expect(counts).toEqual({ Yangi: 4, Muzokara: 3, Sotildi: 1, "Yo'qotildi": 1 });
    const ali = d.managers.find((m) => m.id === "a")!;
    expect(ali.leads.cur).toBe(2);
    expect(ali.worked).toBe(2);
    expect(ali.conversion).toBe(50);
  });

  it("uses the team plan, or the managers' plans added up", () => {
    const one = computeDesk(base({ plans: [{ profile_id: null, target_amount: 5_000_000 }] }));
    expect(one.plan.team).toBe(5_000_000);
    const two = computeDesk(
      base({
        plans: [
          { profile_id: "a", target_amount: 2_000_000 },
          { profile_id: "b", target_amount: 1_000_000 },
        ],
      }),
    );
    expect(two.plan.team).toBe(3_000_000);
    expect(two.managers.find((m) => m.id === "a")!.plan).toBe(2_000_000);
  });

  it("compares a month with the same days of last month", () => {
    const now = new Date(2026, 2, 31);
    expect(deskPeriod("month", now)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
      prevFrom: "2026-02-01",
      prevTo: "2026-02-28",
    });
    expect(deskPeriod("week", new Date(2026, 10, 14))).toMatchObject({
      from: "2026-11-09",
      prevFrom: "2026-11-02",
      prevTo: "2026-11-07",
    });
    expect(deskPeriod("range", now, { from: "2026-03-10", to: "2026-03-19" })).toMatchObject({
      prevFrom: "2026-02-28",
      prevTo: "2026-03-09",
    });
  });

  it("builds the months for Tarix, newest first", () => {
    const h = deskHistory({
      months: ["2026-11-01", "2026-10-01"],
      tz: TZ,
      sales: [
        { revenue: 100, at: day("2026-10-31", 23) },
        { revenue: 50, at: day("2026-11-01", 1) },
      ],
      leads: [{ created_at: day("2026-11-02") }],
      plans: [{ month: "2026-11-01", profile_id: null, target_amount: 1000 }],
    });
    expect(h).toEqual([
      { month: "2026-11-01", revenue: 50, count: 1, leads: 1, plan: 1000 },
      { month: "2026-10-01", revenue: 100, count: 1, leads: 0, plan: 0 },
    ]);
  });
});
