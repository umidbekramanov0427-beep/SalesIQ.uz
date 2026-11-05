import {
  computeMetric,
  formulaUnit,
  lowerIsBetter,
  median,
  metricByOwner,
  type MetricInput,
} from "@/lib/home-metrics";

const range = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 11) }; // 10 days
const prevRange = { from: new Date(2026, 8, 21), to: new Date(2026, 9, 1) };
const at = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
const SALE = "won";

const lead = (
  id: string,
  owner: string,
  created: string,
  extra: Partial<{ contact: string; sold: string; budget: number }> = {},
) => ({
  id,
  owner_id: owner,
  created_at: created,
  first_contact_at: extra.contact ?? null,
  stage_id: extra.sold ? SALE : "new",
  stage_changed_at: extra.sold ?? null,
  budget: extra.budget ?? null,
});

const input: MetricInput = {
  leads: [
    lead("a", "ali", at(1, 9), {
      contact: new Date(2026, 9, 1, 9, 30).toISOString(),
      sold: at(3),
      budget: 100,
    }),
    lead("b", "ali", at(2, 9), { contact: at(2, 12) }),
    lead("c", "vali", at(2, 9), { sold: at(9), budget: 300 }),
    lead("d", "vali", at(5, 9)),
    lead("old", "vali", new Date(2026, 8, 25).toISOString()),
  ],
  calls: [
    { lead_id: "a", occurred_at: at(1, 9), connected: true, owner_id: "ali" },
    { lead_id: "b", occurred_at: at(2, 10), connected: false, owner_id: "ali" },
    { lead_id: "b", occurred_at: at(2, 11), connected: false, owner_id: "ali" },
    { lead_id: "b", occurred_at: at(2, 12), connected: true, owner_id: "ali" },
  ],
  isSale: (id) => id === SALE,
};

describe("home metrics", () => {
  it("median handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("new leads: all, contacted, not contacted, with the previous period", () => {
    expect(computeMetric("newLeads", "all", input, range, prevRange).value).toBe(4);
    expect(computeMetric("newLeads", "all", input, range, prevRange).prev).toBe(1);
    expect(computeMetric("newLeads", "contacted", input, range, prevRange).value).toBe(2);
    expect(computeMetric("newLeads", "notContacted", input, range, prevRange).value).toBe(2);
  });

  it("revenue: total, average deal, deal count", () => {
    expect(computeMetric("revenue", "sum", input, range, prevRange).value).toBe(400);
    expect(computeMetric("revenue", "avgDeal", input, range, prevRange).value).toBe(200);
    expect(computeMetric("revenue", "deals", input, range, prevRange).value).toBe(2);
    expect(formulaUnit("revenue", "deals")).toBe("count");
  });

  it("first contact: average, median and the share within an hour", () => {
    // a: 0.5 h, b: 3 h
    expect(computeMetric("firstContact", "avg", input, range, prevRange).value).toBe(1.75);
    expect(computeMetric("firstContact", "median", input, range, prevRange).value).toBe(1.75);
    expect(computeMetric("firstContact", "within1h", input, range, prevRange).value).toBe(50);
    expect(lowerIsBetter("firstContact", "avg")).toBe(true);
    expect(lowerIsBetter("firstContact", "within1h")).toBe(false);
  });

  it("attempts: average and the first-try share", () => {
    expect(computeMetric("attempts", "avg", input, range, prevRange).value).toBe(2);
    expect(computeMetric("attempts", "firstTry", input, range, prevRange).value).toBe(50);
  });

  it("conversion: cohort vs sales per new lead", () => {
    expect(computeMetric("conversion", "cohort", input, range, prevRange).value).toBe(50);
    expect(computeMetric("conversion", "period", input, range, prevRange).value).toBe(50);
  });

  it("series has one value per day", () => {
    const s = computeMetric("newLeads", "all", input, range, prevRange).series;
    expect(s.length).toBe(10);
    expect(s[1]).toBe(2); // 2 Oct: b and c
  });

  it("lists managers best first, lower-is-better ascending", () => {
    expect(metricByOwner("revenue", "sum", input, range)).toEqual([
      { ownerId: "vali", value: 300 },
      { ownerId: "ali", value: 100 },
    ]);
    // Only ali has contacted leads; vali has nothing to measure and is left out.
    expect(metricByOwner("firstContact", "avg", input, range)).toEqual([
      { ownerId: "ali", value: 1.75 },
    ]);
  });
});
