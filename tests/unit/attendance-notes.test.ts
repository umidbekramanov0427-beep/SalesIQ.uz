import {
  BTN_IN,
  BTN_MINE,
  BTN_NOTE,
  BTN_OUT,
  NOTE_CALLBACK,
  NOTE_CALLBACK_RE,
  attendanceKeyboard,
  cleanNote,
  dateLine,
  davomatimText,
  monthSummary,
  noteKind,
  noteWaitFresh,
  renderReminder,
} from "@/lib/attendance-notes";
import { attendanceReportText } from "@/lib/attendance-rules";

describe("the bot's keyboard", () => {
  it("has the check-in button on top, comment and summary below", () => {
    const k = attendanceKeyboard(false);
    expect(k.keyboard[0]).toEqual([{ text: BTN_IN, request_location: true }]);
    expect(k.keyboard[1]).toEqual([{ text: BTN_NOTE }, { text: BTN_MINE }]);
    expect(attendanceKeyboard(true).keyboard[0]![0]!.text).toBe(BTN_OUT);
  });

  it("answers its own inline button only", () => {
    expect(NOTE_CALLBACK_RE.test(NOTE_CALLBACK)).toBe(true);
    expect(NOTE_CALLBACK_RE.test("attnote:x")).toBe(false);
  });
});

describe("dateLine", () => {
  it("names the weekday and the date", () => {
    expect(dateLine("2026-11-13", 5)).toBe("📅 <b>Juma, 13-noyabr</b>");
    expect(dateLine("2026-11-15", 7)).toContain("Yakshanba, 15-noyabr");
  });
});

describe("renderReminder", () => {
  it("bolds the numbers and keeps the company's text safe", () => {
    expect(renderReminder("{name}, {left} qoldi", { name: "A<b>", left: "10 daqiqa" })).toBe(
      "A&lt;b&gt;, <b>10</b> daqiqa qoldi",
    );
    expect(renderReminder("<b>Diqqat</b> 1 < 2 {x}", {})).toBe("<b>Diqqat</b> 1 &lt; 2 {x}");
  });
});

describe("comments", () => {
  it("guesses lateness from the day", () => {
    const base = { workday: true, shiftStarted: true, checkedIn: false, lateMin: 0 };
    expect(noteKind(base)).toBe("late");
    expect(noteKind({ ...base, shiftStarted: false })).toBe("other");
    expect(noteKind({ ...base, checkedIn: true, lateMin: 12 })).toBe("late");
    expect(noteKind({ ...base, checkedIn: true })).toBe("other");
    expect(noteKind({ ...base, workday: false })).toBe("other");
  });

  it("cleans what is typed and waits only a while", () => {
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote("  Tirbandlik \n")).toBe("Tirbandlik");
    expect(cleanNote("x".repeat(2000))!.length).toBe(1000);
    const now = new Date("2026-11-13T05:00:00Z");
    expect(noteWaitFresh("2026-11-13T04:50:00Z", now)).toBe(true);
    expect(noteWaitFresh("2026-11-13T04:40:00Z", now)).toBe(false);
  });

  it("go into the evening report under the person", () => {
    const text = attendanceReportText("Kompaniya", "13-noyabr", [
      {
        name: "Aziz",
        clockIn: "09:25",
        method: "telegram",
        lateMin: 25,
        workedMin: 300,
        dayOff: false,
        note: "Tirbandlik",
      },
      {
        name: "Vali",
        clockIn: null,
        method: null,
        lateMin: 0,
        workedMin: 0,
        dayOff: false,
        note: "Kasalman",
      },
    ]);
    expect(text).toContain("• Aziz — 09:25 (+25 daq)\n   💬 <i>Tirbandlik</i>");
    expect(text).toContain("• Vali\n   💬 <i>Kasalman</i>");
  });
});

describe("Davomatim", () => {
  const days = [
    { date: "2026-11-11", clockIn: "09:00", lateMin: 0, workedMin: 480, workday: true },
    { date: "2026-11-12", clockIn: "09:20", lateMin: 20, workedMin: 460, workday: true },
    { date: "2026-11-13", clockIn: null, lateMin: 0, workedMin: 0, workday: true },
  ];

  it("sums the month", () => {
    expect(monthSummary(days)).toEqual({
      workdays: 3,
      came: 2,
      lateDays: 1,
      lateMin: 20,
      workedMin: 940,
    });
  });

  it("reads today and the month", () => {
    const text = davomatimText({
      name: "Umidjon Ramanov",
      today: days[2]!,
      shift: { start: "09:00", end: "18:00" },
      open: false,
      month: monthSummary(days),
      monthName: "Noyabr oyi",
      notes: [{ date: "2026-11-12", kind: "late", body: "Tirbandlik" }],
    });
    expect(text).toContain("Davomatim — Umidjon");
    expect(text).toContain("Bugun hali belgilanmagan");
    expect(text).toContain("Kelgan kunlar: <b>2</b> / 3");
    expect(text).toContain("Kechikkan kunlar: <b>1</b> (jami 20 daq)");
    expect(text).toContain("12-noyabr — Tirbandlik");
  });
});
