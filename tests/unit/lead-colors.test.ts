import {
  leadColor,
  parseLeadColorRules,
  ruleMatches,
  withLeadColorRules,
  type ColorableLead,
  type LeadColorRule,
} from "@/lib/lead-colors";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 86_400_000;

function lead(over: Partial<ColorableLead> = {}): ColorableLead {
  return {
    nextFollowUpIso: new Date(NOW + DAY).toISOString(),
    tags: [],
    source: "Instagram",
    expectedRevenue: 0,
    budget: 0,
    stageChangedAtIso: new Date(NOW - DAY).toISOString(),
    createdAtIso: new Date(NOW - 10 * DAY).toISOString(),
    lastContactIso: new Date(NOW - DAY).toISOString(),
    temperature: "Warm",
    priority: "Normal",
    stageIsWon: false,
    stageIsLost: false,
    customFields: {},
    ...over,
  };
}

const rule = (over: Partial<LeadColorRule>): LeadColorRule => ({
  id: "r",
  kind: "noTask",
  value: "",
  color: "red",
  funnel: "*",
  enabled: true,
  ...over,
});

describe("lead colours", () => {
  it("matches task conditions only on open leads", () => {
    expect(ruleMatches(rule({ kind: "noTask" }), lead({ nextFollowUpIso: null }), NOW)).toBe(true);
    expect(
      ruleMatches(rule({ kind: "noTask" }), lead({ nextFollowUpIso: null, stageIsWon: true }), NOW),
    ).toBe(false);
    expect(
      ruleMatches(
        rule({ kind: "overdueTask" }),
        lead({ nextFollowUpIso: new Date(NOW - 60_000).toISOString() }),
        NOW,
      ),
    ).toBe(true);
    expect(ruleMatches(rule({ kind: "overdueTask" }), lead(), NOW)).toBe(false);
  });

  it("compares tags and sources without case", () => {
    expect(ruleMatches(rule({ kind: "tag", value: "vip" }), lead({ tags: ["VIP"] }), NOW)).toBe(
      true,
    );
    expect(ruleMatches(rule({ kind: "tag", value: " " }), lead({ tags: [""] }), NOW)).toBe(false);
    expect(ruleMatches(rule({ kind: "source", value: "instagram " }), lead(), NOW)).toBe(true);
  });

  it("reads amounts and day counts", () => {
    expect(
      ruleMatches(
        rule({ kind: "amountAtLeast", value: "1000000" }),
        lead({ budget: 1_000_000 }),
        NOW,
      ),
    ).toBe(true);
    expect(ruleMatches(rule({ kind: "amountAtLeast", value: "" }), lead(), NOW)).toBe(false);
    expect(ruleMatches(rule({ kind: "daysInStage", value: "3" }), lead(), NOW)).toBe(false);
    expect(
      ruleMatches(
        rule({ kind: "daysInStage", value: "3" }),
        lead({ stageChangedAtIso: null }),
        NOW,
      ),
    ).toBe(true);
    expect(
      ruleMatches(rule({ kind: "noContactDays", value: "7" }), lead({ lastContactIso: null }), NOW),
    ).toBe(true);
  });

  it("matches a custom field value, also inside a list", () => {
    const r = rule({ kind: "customField", field: "city", value: "toshkent" });
    expect(ruleMatches(r, lead({ customFields: { city: "Toshkent" } }), NOW)).toBe(true);
    expect(ruleMatches(r, lead({ customFields: { city: ["Samarqand", "Toshkent"] } }), NOW)).toBe(
      true,
    );
    expect(ruleMatches(r, lead(), NOW)).toBe(false);
  });

  it("takes the first enabled rule of the funnel", () => {
    const rules = [
      rule({ id: "a", kind: "tag", value: "vip", color: "violet", enabled: false }),
      rule({ id: "b", kind: "tag", value: "vip", color: "pink", funnel: "Kurslar" }),
      rule({ id: "c", kind: "noTask", color: "red" }),
      rule({ id: "d", kind: "tag", value: "vip", color: "green" }),
    ];
    const l = lead({ tags: ["VIP"], nextFollowUpIso: null });
    expect(leadColor(l, rules, "Kurslar", NOW)).toBe("pink");
    expect(leadColor(l, rules, "Asosiy", NOW)).toBe("red");
    expect(leadColor(lead(), rules, "Asosiy", NOW)).toBeNull();
  });

  it("parses saved rules defensively and keeps other settings", () => {
    const saved = withLeadColorRules({ layouts: { "*": {} } }, [rule({ id: "x" })]);
    expect(saved["layouts"]).toEqual({ "*": {} });
    const parsed = parseLeadColorRules({
      colorRules: [
        { id: "x", kind: "tag", value: "a", color: "sky" },
        { id: "y", kind: "nope", color: "sky" },
        { id: "z", kind: "tag", color: "rainbow" },
        null,
      ],
    });
    expect(parsed).toEqual([
      {
        id: "x",
        kind: "tag",
        value: "a",
        field: undefined,
        color: "sky",
        funnel: "*",
        enabled: true,
      },
    ]);
    expect(parseLeadColorRules(null)).toEqual([]);
  });
});
