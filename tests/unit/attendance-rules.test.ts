import {
  DEFAULT_ATTENDANCE_RULES,
  distanceM,
  hoursText,
  isWorkday,
  lateMinutes,
  localClock,
  parseAttendanceRules,
  shiftFor,
  workedMinutes,
} from "@/lib/attendance-rules";

const shift = { id: "main", name: "Asosiy", start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };

describe("attendance rules", () => {
  it("falls back to defaults and drops junk", () => {
    expect(parseAttendanceRules(null)).toEqual(DEFAULT_ATTENDANCE_RULES);
    const r = parseAttendanceRules({
      office: { lat: 41.31, lng: 69.28, radiusM: 9999999 },
      graceMin: -5,
      shifts: [
        { id: "a", name: "Kunduzgi", start: "08:00", end: "17:00", days: [1, 2, 9, 2] },
        { id: "b", start: "25:00", end: "10:00" },
      ],
      assign: { p1: "a", p2: "missing" },
      report: { time: "19:00", enabled: false },
      methods: { web: false },
    });
    expect(r.office).toEqual({ lat: 41.31, lng: 69.28, radiusM: 150 });
    expect(r.graceMin).toBe(10);
    expect(r.shifts).toHaveLength(1);
    expect(r.shifts[0].days).toEqual([1, 2]);
    expect(r.assign).toEqual({ p1: "a" });
    expect(r.report).toEqual({ enabled: false, time: "19:00" });
    expect(r.methods).toEqual({ web: false, telegram: true });
  });

  it("measures distance in metres", () => {
    const office = { lat: 41.3111, lng: 69.2797 };
    expect(distanceM(office, office)).toBe(0);
    const d = distanceM(office, { lat: 41.3121, lng: 69.2797 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it("reads the Tashkent wall clock", () => {
    // 2026-11-12 is a Thursday; 04:20 UTC = 09:20 Tashkent.
    const c = localClock(new Date("2026-11-12T04:20:00Z"));
    expect(c).toEqual({ minutes: 9 * 60 + 20, weekday: 4, date: "2026-11-12" });
  });

  it("counts lateness past the grace on workdays only", () => {
    expect(lateMinutes(new Date("2026-11-12T04:08:00Z"), shift, 10)).toBe(0);
    expect(lateMinutes(new Date("2026-11-12T04:25:00Z"), shift, 10)).toBe(25);
    // Saturday
    expect(lateMinutes(new Date("2026-11-14T06:00:00Z"), shift, 10)).toBe(0);
    expect(isWorkday(shift, new Date("2026-11-14T06:00:00Z"))).toBe(false);
  });

  it("takes the break off a long day", () => {
    const rules = { breakMin: 60, breakAfterMin: 300 };
    const inAt = new Date("2026-11-12T04:00:00Z");
    expect(workedMinutes(inAt, new Date("2026-11-12T13:00:00Z"), rules)).toBe(480);
    expect(workedMinutes(inAt, new Date("2026-11-12T07:00:00Z"), rules)).toBe(180);
    expect(workedMinutes(inAt, null, rules, new Date("2026-11-12T05:00:00Z"))).toBe(60);
  });

  it("finds a person's shift", () => {
    const r = parseAttendanceRules({
      shifts: [shift, { id: "n", name: "Kechki", start: "14:00", end: "22:00", days: [1] }],
      assign: { p: "n" },
    });
    expect(shiftFor(r, "p").id).toBe("n");
    expect(shiftFor(r, "x").id).toBe("main");
    expect(hoursText(500)).toBe("8 soat 20 daq");
    expect(hoursText(45)).toBe("45 daq");
  });
});

describe("attendance report", () => {
  it("lists late and absent people", async () => {
    const { attendanceReportText } = await import("@/lib/attendance-rules");
    const text = attendanceReportText("Demo <MChJ>", "12-noyabr", [
      {
        name: "Ali",
        clockIn: "09:25",
        method: "telegram",
        lateMin: 25,
        workedMin: 480,
        dayOff: false,
      },
      { name: "Vali", clockIn: "08:58", method: "web", lateMin: 0, workedMin: 500, dayOff: false },
      { name: "Gani", clockIn: null, method: null, lateMin: 0, workedMin: 0, dayOff: false },
      { name: "Dam", clockIn: null, method: null, lateMin: 0, workedMin: 0, dayOff: true },
    ]);
    expect(text).toContain("Demo &lt;MChJ&gt;");
    expect(text).toContain("Keldi: <b>2/3</b>");
    expect(text).toContain("• Ali — 09:25 (+25 daq)");
    expect(text).toContain("Kelmaganlar</b>\n• Gani");
    expect(text).not.toContain("Dam");
    expect(text).toContain("📍 Ali — 09:25, 8 soat");
  });
});

describe("work start mode", () => {
  it("picks the check-in, the first contact or the earlier one", async () => {
    const { dayStart, parseAttendanceRules } = await import("@/lib/attendance-rules");
    expect(parseAttendanceRules({}).startMode).toBe("both");
    expect(
      parseAttendanceRules({ startMode: "contact", contact: { messages: false } }).contact,
    ).toEqual({
      calls: true,
      messages: false,
    });
    const a = "2026-11-12T04:10:00Z";
    const b = "2026-11-12T04:30:00Z";
    expect(dayStart({ startMode: "both" }, b, a)).toEqual({ at: a, by: "contact" });
    expect(dayStart({ startMode: "both" }, a, b)).toEqual({ at: a, by: "checkin" });
    expect(dayStart({ startMode: "button" }, b, a)).toEqual({ at: b, by: "checkin" });
    expect(dayStart({ startMode: "contact" }, a, b)).toEqual({ at: b, by: "contact" });
    expect(dayStart({ startMode: "button" }, null, a)).toEqual({ at: null, by: null });
  });
});
