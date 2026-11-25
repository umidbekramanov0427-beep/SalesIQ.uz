import { nextDue, presetDue } from "@/lib/staff-tasks";

describe("staff tasks", () => {
  it("moves a repeating task to its next period", () => {
    const iso = new Date(2026, 10, 25, 9, 0).toISOString();
    expect(new Date(nextDue(iso, "daily")).getDate()).toBe(26);
    expect(new Date(nextDue(iso, "weekly")).getDate()).toBe(2);
    expect(new Date(nextDue(iso, "monthly")).getMonth()).toBe(11);
    expect(nextDue(iso, "once")).toBe(iso);
  });
  it("gives the deadline quick choices", () => {
    const now = new Date(2026, 10, 25, 10, 7); // Wednesday
    expect(presetDue("m15", now)).toBe("2026-11-25T10:22");
    expect(presetDue("today", now)).toBe("2026-11-25T18:00");
    expect(presetDue("tomorrow", now)).toBe("2026-11-26T09:00");
    expect(presetDue("weekEnd", now)).toBe("2026-11-27T18:00");
    expect(presetDue("year", now)).toBe("2027-11-25T10:07");
  });
});
