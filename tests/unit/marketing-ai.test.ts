import { qualOf } from "@/lib/marketing-ai/qual";
import { computeMetrics, ruleAlerts, metricValue, type MLead } from "@/lib/marketing-ai/metrics";
import { factsOf, inputHash, numbersOf, validateFindings } from "@/lib/marketing-ai/diagnose";
import { forecast, weekly, weekOf } from "@/lib/marketing-ai/forecast";

const lead = (p: Partial<MLead>): MLead => ({
  createdAt: "2027-01-05T10:00:00Z",
  campaign: "meta_kuz",
  source: "Facebook",
  phone: "+998901234567",
  answered: 0,
  unanswered: 0,
  watched: null,
  qualStatus: null,
  notQualReason: null,
  advance: false,
  full: false,
  paid: 0,
  ...p,
});

describe("qualification", () => {
  it("follows the owner's rule", () => {
    const base = {
      answeredCalls: 0,
      unansweredCalls: 0,
      watched: null,
      manualStatus: null,
      manualReason: null,
    };
    expect(
      qualOf({ ...base, phone: "+998901234567", answeredCalls: 1, watched: true }).status,
    ).toBe("qualified");
    expect(qualOf({ ...base, phone: null })).toMatchObject({
      status: "not_qualified",
      reason: "no_number",
    });
    expect(qualOf({ ...base, phone: "12" })).toMatchObject({ reason: "wrong_number" });
    expect(qualOf({ ...base, phone: "+998901234567", unansweredCalls: 3 })).toMatchObject({
      reason: "no_answer",
    });
    expect(
      qualOf({ ...base, phone: "+998901234567", answeredCalls: 2, watched: false }),
    ).toMatchObject({ reason: "no_webinar" });
    expect(qualOf({ ...base, phone: "+998901234567", answeredCalls: 1 }).status).toBe("pending");
    expect(qualOf({ ...base, phone: null, manualStatus: "qualified" })).toMatchObject({
      status: "qualified",
      manual: true,
    });
  });
});

describe("metrics", () => {
  const leads = [
    ...Array.from({ length: 10 }, () =>
      lead({ answered: 1, watched: true, advance: true, paid: 500_000 }),
    ),
    ...Array.from({ length: 5 }, () =>
      lead({ answered: 1, watched: true, full: true, advance: true, paid: 2_000_000 }),
    ),
    ...Array.from({ length: 10 }, () => lead({ phone: null })),
    ...Array.from({ length: 15 }, () => lead({ campaign: "insta", unanswered: 3 })),
  ];
  const m = computeMetrics({
    from: "2027-01-01T00:00:00Z",
    to: "2027-02-01T00:00:00Z",
    leads,
    spend: [
      { day: "2027-01-03", campaign: "meta_kuz", source: "Meta", amount: 10_000_000 },
      { day: "2027-01-03", campaign: "insta", source: "Meta", amount: 5_000_000 },
    ],
    spendKnown: true,
    webinars: [],
    channels: [],
  });

  it("counts the funnel and the money", () => {
    expect(m.funnel).toMatchObject({
      leads: 40,
      qualified: 15,
      advance: 15,
      full: 5,
      revenue: 15_000_000,
    });
    expect(m.funnel.reasons.no_number).toBe(10);
    expect(m.funnel.reasons.no_answer).toBe(15);
    expect(m.efficiency).toMatchObject({
      spend: 15_000_000,
      cpl: 375_000,
      cpql: 1_000_000,
      cac: 3_000_000,
      roas: 1,
      roi: 0,
    });
    expect(m.missing).toContain("webinars");
    expect(m.missing).not.toContain("spend");
  });

  it("splits by campaign with its own spend", () => {
    const meta = m.campaigns.find((c) => c.name === "meta_kuz")!;
    expect(meta).toMatchObject({ leads: 25, qualified: 15, spend: 10_000_000, cpql: 666_667 });
    expect(m.campaigns.find((c) => c.name === "insta")?.qualified).toBe(0);
  });

  it("raises alerts from the numbers alone", () => {
    const keys = ruleAlerts(m, null).map((a) => a.key);
    expect(keys).toContain("bad_numbers");
    expect(metricValue(m, "qual_rate")).toBeCloseTo(15 / 40);
  });

  it("says spend is missing instead of showing 0", () => {
    const x = computeMetrics({
      from: "a",
      to: "b",
      leads,
      spend: [],
      spendKnown: false,
      webinars: [],
      channels: [],
    });
    expect(x.efficiency.cpl).toBeNull();
    expect(x.missing).toContain("spend");
  });

  it("keeps only findings whose numbers are in the data", () => {
    const facts = factsOf(m, null);
    const ok = {
      problem: "Raqamsiz lidlar ko'p",
      evidence: ["40 liddan 10 tasida raqam yo'q", "Kval 37.5%"],
      analysis: "",
      assumptions: [],
      recommendations: ["Formaga raqam majburiy qilinsin"],
      priority: "critical",
    };
    const made = { ...ok, evidence: ["CPL 812 345 so'm"] };
    const r = validateFindings({ findings: [ok, made] }, facts);
    expect(r.findings).toHaveLength(1);
    expect(r.rejected).toBe(1);
    expect(numbersOf("12 400 so'm, 38,5%")).toEqual([12400, 38.5]);
    expect(inputHash({ b: 1, a: 2 })).toBe(inputHash({ a: 2, b: 1 }));
  });
});

describe("forecast", () => {
  it("needs four weeks and gives a range", () => {
    expect(forecast([{ week: "2027-01-04", value: 5 }]).enough).toBe(false);
    const s = [10, 12, 14, 16, 18, 20, 22, 24].map((v, i) => ({
      week: new Date(Date.UTC(2027, 0, 4 + i * 7)).toISOString().slice(0, 10),
      value: v,
    }));
    const f = forecast(s, 2);
    expect(f.enough).toBe(true);
    expect(f.next[0]?.value).toBe(26);
    expect(f.confidence).toBe("high");
    expect(f.slope).toBe(2);
  });

  it("groups by Tashkent week", () => {
    expect(weekOf("2027-01-10T20:00:00Z")).toBe("2027-01-11"); // Monday 01:00 in Tashkent
    const w = weekly(
      [{ at: "2027-01-05T10:00:00Z", value: 2 }],
      "2027-01-04T00:00:00Z",
      "2027-01-20T00:00:00Z",
    );
    expect(w.map((p) => p.value)).toEqual([2, 0, 0]);
  });
});
