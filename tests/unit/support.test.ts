import {
  average,
  cleanSupportText,
  responseLabel,
  supportResponseTimes,
  SUPPORT_TEXT_MAX,
  type SupportMessage,
} from "@/lib/support";

const msg = (direction: "in" | "out", at: string): SupportMessage => ({
  id: at,
  direction,
  text: "x",
  created_at: `2026-10-15T${at}:00.000Z`,
});

describe("supportResponseTimes", () => {
  it("measures from the first unanswered question to the answer", () => {
    const r = supportResponseTimes([
      msg("in", "10:00"),
      msg("in", "10:02"),
      msg("out", "10:05"),
      msg("in", "11:00"),
      msg("out", "11:01"),
    ]);
    expect(r.responsesMs).toEqual([5 * 60_000, 60_000]);
    expect(r.waitingSince).toBeNull();
  });

  it("reports a question still waiting", () => {
    const r = supportResponseTimes([msg("out", "09:00"), msg("in", "10:00"), msg("in", "10:01")]);
    expect(r.responsesMs).toEqual([]);
    expect(r.waitingSince).toBe("2026-10-15T10:00:00.000Z");
  });

  it("ignores input order", () => {
    const r = supportResponseTimes([msg("out", "10:03"), msg("in", "10:00")]);
    expect(r.responsesMs).toEqual([3 * 60_000]);
  });
});

describe("responseLabel", () => {
  const u = { min: "daq", hour: "soat", day: "kun" };
  it("formats minutes, hours and days", () => {
    expect(responseLabel(20_000, u)).toBe("1 daq");
    expect(responseLabel(45 * 60_000, u)).toBe("45 daq");
    expect(responseLabel(80 * 60_000, u)).toBe("1 soat 20 daq");
    expect(responseLabel(120 * 60_000, u)).toBe("2 soat");
    expect(responseLabel(72 * 3_600_000, u)).toBe("3 kun");
  });
});

describe("cleanSupportText", () => {
  it("trims and rejects empty or too long text", () => {
    expect(cleanSupportText("  salom ")).toBe("salom");
    expect(cleanSupportText("   ")).toBeNull();
    expect(cleanSupportText(42)).toBeNull();
    expect(cleanSupportText("a".repeat(SUPPORT_TEXT_MAX + 1))).toBeNull();
  });
});

describe("average", () => {
  it("is null for no values", () => {
    expect(average([])).toBeNull();
    expect(average([2, 4])).toBe(3);
  });
});
