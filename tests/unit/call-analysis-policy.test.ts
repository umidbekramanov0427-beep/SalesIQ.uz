import {
  AUTO_ANALYSIS_DURATION_FILTER,
  autoAnalysable,
  autoAnalysisSince,
} from "@/lib/call-analysis-policy";

const NOW = Date.parse("2026-10-17T10:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("call analysis policy", () => {
  it("starts the window 30 days back", () => {
    expect(autoAnalysisSince(NOW)).toBe("2026-09-17T10:00:00.000Z");
  });

  it("skips calls older than the window", () => {
    expect(
      autoAnalysable({ source: "amocrm", duration_seconds: 300, occurred_at: daysAgo(31) }, NOW),
    ).toBe(false);
    expect(
      autoAnalysable({ source: "amocrm", duration_seconds: 300, occurred_at: daysAgo(29) }, NOW),
    ).toBe(true);
  });

  it("skips amoCRM calls too short to be a conversation", () => {
    const at = daysAgo(1);
    expect(autoAnalysable({ source: "amocrm", duration_seconds: 14, occurred_at: at }, NOW)).toBe(
      false,
    );
    expect(autoAnalysable({ source: "amocrm", duration_seconds: 15, occurred_at: at }, NOW)).toBe(
      true,
    );
    expect(autoAnalysable({ source: null, duration_seconds: null, occurred_at: at }, NOW)).toBe(
      false,
    );
  });

  it("keeps uploaded and telephony calls without a duration", () => {
    const at = daysAgo(1);
    expect(autoAnalysable({ source: "upload", duration_seconds: null, occurred_at: at }, NOW)).toBe(
      true,
    );
    expect(autoAnalysable({ source: "pbx", duration_seconds: 3, occurred_at: at }, NOW)).toBe(true);
  });

  it("mirrors the duration rule as a PostgREST filter", () => {
    expect(AUTO_ANALYSIS_DURATION_FILTER).toBe("source.neq.amocrm,duration_seconds.gte.15");
  });
});
