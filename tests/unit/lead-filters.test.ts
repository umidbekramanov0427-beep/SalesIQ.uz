import {
  EMPTY_LEAD_FILTERS,
  filterLeads,
  leadDateFor,
  leadDebt,
  type LeadFilterState,
} from "@/components/crm/LeadFilterBar";
import type { CrmLeadView } from "@/hooks/use-crm-data";

const lead = (p: Partial<CrmLeadView>): CrmLeadView =>
  ({
    id: "l1",
    name: "Ali",
    company: "",
    contactName: "",
    phone: "",
    email: "",
    ownerId: "u1",
    stageId: "s1",
    stageIsWon: false,
    stageIsLost: false,
    tags: [],
    source: "",
    campaign: "",
    stream: "",
    expectedRevenue: 1000,
    paidAmount: 0,
    nextFollowUpIso: null,
    customFields: {},
    createdAtIso: "2026-11-01T10:00:00Z",
    stageChangedAtIso: "2026-11-03T10:00:00Z",
    ...p,
  }) as CrmLeadView;

const f = (p: Partial<LeadFilterState>): LeadFilterState => ({ ...EMPTY_LEAD_FILTERS, ...p });
const ids = (rows: CrmLeadView[]) => rows.map((r) => r.id);

describe("funnel filters (5CRM)", () => {
  it("counts debt as the sum minus what is paid", () => {
    expect(leadDebt({ expectedRevenue: 1000, paidAmount: 300 })).toBe(700);
    expect(leadDebt({ expectedRevenue: 1000, paidAmount: 1500 })).toBe(0);
    expect(leadDebt({ expectedRevenue: 1000, paidAmount: undefined })).toBe(1000);
  });

  it("dates a lead by created, closed or stage change", () => {
    const open = lead({});
    const won = lead({ stageIsWon: true });
    expect(leadDateFor(open, "created")).toBe("2026-11-01T10:00:00Z");
    expect(leadDateFor(open, "stage")).toBe("2026-11-03T10:00:00Z");
    expect(leadDateFor(open, "closed")).toBeNull();
    expect(leadDateFor(won, "closed")).toBe("2026-11-03T10:00:00Z");
  });

  it("filters by closed preset, paid / debt ranges and custom fields", () => {
    const rows = [
      lead({ id: "a", paidAmount: 1000, customFields: { age: 25, city: "Toshkent" } }),
      lead({ id: "b", paidAmount: 200, stageIsLost: true, customFields: { age: 40 } }),
      lead({ id: "c", paidAmount: 0, customFields: { level: ["A1", "A2"] } }),
    ];
    expect(ids(filterLeads(rows, f({ preset: "closed" })))).toEqual(["b"]);
    expect(ids(filterLeads(rows, f({ paid: { min: 500, max: null } })))).toEqual(["a"]);
    expect(ids(filterLeads(rows, f({ debt: { min: 1, max: 900 } })))).toEqual(["b"]);
    expect(ids(filterLeads(rows, f({ ranges: { age: { min: 30, max: 50 } } })))).toEqual(["b"]);
    expect(ids(filterLeads(rows, f({ customText: { city: "tosh" } })))).toEqual(["a"]);
    expect(ids(filterLeads(rows, f({ custom: { level: "A2" } })))).toEqual(["c"]);
  });
});
