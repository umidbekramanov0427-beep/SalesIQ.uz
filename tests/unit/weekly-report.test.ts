import { isReportTime, lastWeek, trend, weeklyReportText } from "@/lib/weekly-report";

describe("weekly owner report", () => {
  it("takes the last full Tashkent week", () => {
    // Monday 2026-10-19 10:00 Tashkent = 05:00 UTC.
    const w = lastWeek(Date.parse("2026-10-19T05:00:00Z"));
    expect(new Date(w.from).toISOString()).toBe("2026-10-11T19:00:00.000Z"); // Mon 12th 00:00 Tashkent
    expect(new Date(w.to).toISOString()).toBe("2026-10-18T19:00:00.000Z");
    expect(w.monday).toBe("2026-10-19");
    // A Wednesday still points at the same week.
    expect(lastWeek(Date.parse("2026-10-21T12:00:00Z")).monday).toBe("2026-10-19");
  });

  it("sends on Monday from 09:00 Tashkent", () => {
    expect(isReportTime(Date.parse("2026-10-19T03:59:00Z"))).toBe(false);
    expect(isReportTime(Date.parse("2026-10-19T04:00:00Z"))).toBe(true);
    expect(isReportTime(Date.parse("2026-10-20T05:00:00Z"))).toBe(false);
  });

  it("compares with the week before", () => {
    expect(trend(12, 10)).toBe(" · ▲ 20%");
    expect(trend(9, 10)).toBe(" · ▼ 10%");
    expect(trend(5, 0)).toBe(" · yangi");
    expect(trend(0, 0)).toBe("");
  });

  it("writes the message and skips empty sections", () => {
    const zero = { newLeads: 0, won: 0, wonAmount: 0, collected: 0, calls: 0, missedCalls: 0 };
    const text = weeklyReportText(
      {
        company: "Sinov <MChJ>",
        week: { ...zero, newLeads: 40, won: 6, wonAmount: 12_000_000 },
        prev: { ...zero, newLeads: 32, won: 6 },
        topManager: { name: "Aziza", won: 3 },
        overdueTasks: 2,
        appUrl: "https://salesiq.uz",
      },
      { from: Date.parse("2026-10-11T19:00:00Z"), to: Date.parse("2026-10-18T19:00:00Z") },
    );
    expect(text).toContain("Sinov &lt;MChJ&gt;");
    expect(text).toContain("12.10–18.10");
    expect(text).toContain("Yangi lidlar: <b>40</b> · ▲ 25%");
    expect(text).toContain("12 000 000 so'm");
    expect(text).toContain("Konversiya: <b>15%</b>");
    expect(text).not.toContain("Qo'ng'iroqlar");
    expect(text).not.toContain("to'lovlar");
    expect(text).toContain("Aziza");
    expect(text).toContain("Muddati o'tgan vazifalar: <b>2</b>");
  });
});
