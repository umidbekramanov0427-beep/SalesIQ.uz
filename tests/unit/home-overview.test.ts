import { computeHomeOverview, deltaPct } from "@/lib/home-overview";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const range = { from: D("2026-10-11"), to: D("2026-10-21") };
const prevRange = { from: D("2026-10-01"), to: D("2026-10-11") };
const SALE = "won";
const base = { first_contact_at: null, stage_id: null, stage_changed_at: null, budget: 0 };

describe("home overview", () => {
  it("compares new leads, revenue and conversion with the period before", () => {
    const o = computeHomeOverview({
      range,
      prevRange,
      openLeads: 0,
      calls: [],
      tasks: [],
      isSale: (id) => id === SALE,
      leads: [
        { ...base, id: "a", created_at: "2026-10-12T10:00:00Z" },
        { ...base, id: "b", created_at: "2026-10-13T10:00:00Z" },
        {
          ...base,
          id: "c",
          created_at: "2026-10-14T10:00:00Z",
          stage_id: SALE,
          stage_changed_at: "2026-10-16T10:00:00Z",
          budget: 1000,
        },
        { ...base, id: "p", created_at: "2026-10-05T10:00:00Z" },
      ],
    });
    expect(o.newLeads.value).toBe(3);
    expect(o.newLeads.prev).toBe(1);
    expect(o.newLeads.deltaPct).toBe(200);
    expect(o.revenue.value).toBe(1000);
    expect(o.revenue.deals).toBe(1);
    expect(o.leadToSaleDays.value).toBe(2);
    expect(o.conversion.value).toBeCloseTo(33.33, 1);
    expect(o.newLeads.series).toHaveLength(10);
  });

  it("measures speed to lead and attempts until the first connected call", () => {
    const o = computeHomeOverview({
      range,
      prevRange,
      openLeads: 0,
      tasks: [],
      isSale: () => false,
      leads: [
        {
          ...base,
          id: "a",
          created_at: "2026-10-12T10:00:00Z",
          first_contact_at: "2026-10-12T13:00:00Z",
        },
      ],
      calls: [
        { lead_id: "a", occurred_at: "2026-10-12T11:00:00Z", connected: false },
        { lead_id: "a", occurred_at: "2026-10-12T12:00:00Z", connected: false },
        { lead_id: "a", occurred_at: "2026-10-12T13:00:00Z", connected: true },
        { lead_id: null, occurred_at: "2026-10-12T14:00:00Z", connected: true },
      ],
    });
    expect(o.firstContactHours.value).toBe(3);
    expect(o.attemptsToContact.value).toBe(3);
    expect(o.callTypes).toEqual({ first: 1, repeat: 2, other: 1, total: 4 });
  });

  it("counts task discipline for tasks due in the period", () => {
    const o = computeHomeOverview({
      range,
      prevRange,
      openLeads: 4,
      leads: [],
      calls: [],
      isSale: () => false,
      now: D("2026-10-20"),
      tasks: [
        {
          lead_id: "a",
          status: "Done",
          due_date: "2026-10-12T10:00:00Z",
          updated_at: "2026-10-12T09:00:00Z",
        },
        {
          lead_id: "b",
          status: "Done",
          due_date: "2026-10-12T10:00:00Z",
          updated_at: "2026-10-13T09:00:00Z",
        },
        {
          lead_id: "c",
          status: "Todo",
          due_date: "2026-10-15T10:00:00Z",
          updated_at: "2026-10-10T09:00:00Z",
        },
        {
          lead_id: "d",
          status: "Todo",
          due_date: "2026-10-25T10:00:00Z",
          updated_at: "2026-10-10T09:00:00Z",
        },
      ],
    });
    expect(o.tasks.total).toBe(3);
    expect(o.tasks.done).toBe(2);
    expect(o.tasks.onTime).toBe(1);
    expect(o.tasks.onTimePct).toBe(50);
    expect(o.tasks.overdue).toBe(1);
    expect(o.tasks.leadsWithTask).toBe(2);
    expect(o.tasks.leadsWithTaskPct).toBe(50);
  });

  it("has no change when the previous period is empty", () => {
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(5, null)).toBeNull();
    expect(deltaPct(5, 10)).toBe(-50);
  });
});
