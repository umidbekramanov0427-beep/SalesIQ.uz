import {
  dailyRunKey,
  findingsText,
  guessIsNew,
  lastDays,
  parseVisionGuess,
} from "@/lib/marketing-ai/auto";

describe("marketing AI auto runs", () => {
  it("runs daily only after 09:00 Tashkent", () => {
    expect(dailyRunKey(new Date("2026-11-18T03:59:00Z"))).toBeNull();
    expect(dailyRunKey(new Date("2026-11-18T04:00:00Z"))).toBe("ai:daily:2026-11-18");
    expect(dailyRunKey(new Date("2026-11-19T05:00:00Z"))).toBe("ai:daily:2026-11-19");
  });
  it("covers the last 7 Tashkent days", () => {
    const r = lastDays(new Date("2026-11-18T10:00:00Z"));
    expect(r.from).toBe("2026-11-11T19:00:00.000Z");
    expect(r.to).toBe("2026-11-18T19:00:00.000Z");
  });
  it("writes the most urgent findings first", () => {
    const f = (priority: "critical" | "warning" | "opportunity", problem: string) => ({
      problem,
      evidence: ["CPL 50 000"],
      analysis: "",
      assumptions: [],
      recommendations: ["Byudjetni o'tkazing"],
      priority,
      metric: null,
    });
    const text = findingsText(
      [f("opportunity", "A"), f("critical", "B <x>"), f("warning", "C"), f("warning", "D")],
      { from: "2026-11-11T19:00:00.000Z", to: "2026-11-18T19:00:00.000Z" },
    )!;
    expect(text.indexOf("B &lt;x&gt;")).toBeLessThan(text.indexOf("C"));
    expect(text).toContain("12.11.2026 – 18.11.2026");
    expect(text).toContain("yana 1 ta");
    expect(findingsText([], { from: "", to: "" })).toBeNull();
  });
});

describe("frame guesses", () => {
  it("keeps only sure, known moments", () => {
    expect(parseVisionGuess({ kind: "price", confidence: 0.9 })?.kind).toBe("price");
    expect(parseVisionGuess({ kind: "price", confidence: 0.5 })).toBeNull();
    expect(parseVisionGuess({ kind: "none", confidence: 1 })).toBeNull();
    expect(parseVisionGuess({ kind: "sms_sent", confidence: 1 })).toBeNull();
    expect(parseVisionGuess({ kind: "timer", number: 2, confidence: 0.8 })?.seq).toBe(2);
    expect(parseVisionGuess({ kind: "qa", number: 2, confidence: 0.8 })?.seq).toBeNull();
    expect(parseVisionGuess(null)).toBeNull();
  });
  it("skips a moment already marked nearby", () => {
    const marks = [{ kind: "price", seq: null, at: "2026-11-18T10:00:00Z" }];
    expect(guessIsNew({ kind: "price", seq: null, at: "2026-11-18T10:05:00Z" }, marks)).toBe(false);
    expect(guessIsNew({ kind: "price", seq: null, at: "2026-11-18T10:15:00Z" }, marks)).toBe(true);
    const timers = [{ kind: "timer", seq: 1, at: "2026-11-18T10:00:00Z" }];
    expect(guessIsNew({ kind: "timer", seq: 2, at: "2026-11-18T10:03:00Z" }, timers)).toBe(true);
    expect(guessIsNew({ kind: "timer", seq: 1, at: "2026-11-18T10:03:00Z" }, timers)).toBe(false);
  });
});
