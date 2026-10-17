import {
  AUTO_ANALYSIS_DURATION_FILTER,
  AUTO_ANALYSIS_LINKED_FILTER,
  autoAnalysable,
  autoAnalysisSince,
  autoAnalysisWindowFilter,
  readAutoAnalysisSettings,
} from "@/lib/call-analysis-policy";

const NOW = Date.parse("2026-10-17T10:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("call analysis policy", () => {
  it("starts the window 30 days back", () => {
    expect(autoAnalysisSince(NOW)).toBe("2026-09-17T10:00:00.000Z");
  });

  it("skips calls older than the window", () => {
    expect(
      autoAnalysable(
        { source: "amocrm", duration_seconds: 300, occurred_at: daysAgo(31), lead_id: "l1" },
        NOW,
      ),
    ).toBe(false);
    expect(
      autoAnalysable(
        { source: "amocrm", duration_seconds: 300, occurred_at: daysAgo(29), lead_id: "l1" },
        NOW,
      ),
    ).toBe(true);
  });

  it("skips amoCRM calls too short to be a conversation", () => {
    const at = daysAgo(1);
    expect(
      autoAnalysable(
        { source: "amocrm", duration_seconds: 14, occurred_at: at, lead_id: "l1" },
        NOW,
      ),
    ).toBe(false);
    expect(
      autoAnalysable(
        { source: "amocrm", duration_seconds: 15, occurred_at: at, lead_id: "l1" },
        NOW,
      ),
    ).toBe(true);
    expect(
      autoAnalysable({ source: null, duration_seconds: null, occurred_at: at, lead_id: "l1" }, NOW),
    ).toBe(false);
  });

  it("keeps uploaded and telephony calls without a duration", () => {
    const at = daysAgo(1);
    expect(
      autoAnalysable(
        { source: "upload", duration_seconds: null, occurred_at: at, lead_id: "l1" },
        NOW,
      ),
    ).toBe(true);
    expect(
      autoAnalysable({ source: "pbx", duration_seconds: 3, occurred_at: at, lead_id: "l1" }, NOW),
    ).toBe(true);
  });

  it("skips amoCRM calls of leads that were not imported", () => {
    const call = {
      source: "amocrm",
      duration_seconds: 120,
      occurred_at: daysAgo(1),
      lead_id: null,
    };
    expect(autoAnalysable(call, NOW)).toBe(false);
    expect(autoAnalysable({ ...call, source: "upload" }, NOW)).toBe(true);
  });

  it("mirrors the amoCRM rules as PostgREST filters", () => {
    expect(AUTO_ANALYSIS_DURATION_FILTER).toBe("source.neq.amocrm,duration_seconds.gte.15");
    expect(AUTO_ANALYSIS_LINKED_FILTER).toBe("source.neq.amocrm,lead_id.not.is.null");
  });

  it("applies a company's start date (narrowing only) and minimum length", () => {
    const settings = new Map([
      ["a", { since: "2026-10-06T00:00:00.000Z", minSeconds: 60 }],
      ["b", { since: "2026-01-01T00:00:00.000Z" }],
    ]);
    expect(autoAnalysisWindowFilter(["a", "b"], settings, NOW)).toBe(
      "and(organization_id.eq.a,occurred_at.gte.2026-10-06T00:00:00.000Z,or(source.eq.manual,duration_seconds.gte.60))," +
        "and(organization_id.eq.b,occurred_at.gte.2026-09-17T10:00:00.000Z,or(source.eq.manual,duration_seconds.gte.15))",
    );
  });

  it("reads the settings from the integration config", () => {
    expect(
      readAutoAnalysisSettings({
        analysis_since: "2026-10-05T19:00:00Z",
        analysis_min_seconds: "60",
      }),
    ).toEqual({
      since: "2026-10-05T19:00:00.000Z",
      minSeconds: 60,
    });
    expect(
      readAutoAnalysisSettings({ analysis_since: "nope", analysis_min_seconds: null }),
    ).toEqual({});
    expect(readAutoAnalysisSettings(null)).toEqual({});
  });
});
