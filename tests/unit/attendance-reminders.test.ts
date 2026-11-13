import {
  DEFAULT_REMINDERS,
  dueReminder,
  minutesText,
  parseReminders,
  type Shift,
} from "@/lib/attendance-rules";

const shift: Shift = {
  id: "main",
  name: "Asosiy",
  start: "10:00",
  end: "19:00",
  days: [1, 2, 3, 4, 5],
};
const r = { ...DEFAULT_REMINDERS, enabled: true };
const at = (hm: string, weekday = 3) => ({
  minutes: Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)),
  weekday,
});
const away = { checkedIn: false, open: false, name: "Aziz Karimov" };
const working = { checkedIn: true, open: true, name: "Aziz Karimov" };

describe("dueReminder", () => {
  it("counts down to the start for those not checked in", () => {
    expect(dueReminder(r, shift, at("09:00"), away)?.key).toBe("before:60");
    expect(dueReminder(r, shift, at("09:15"), away)?.key).toBe("before:45");
    expect(dueReminder(r, shift, at("09:30"), away)?.text).toContain("30 daqiqa qoldi");
    expect(dueReminder(r, shift, at("09:45"), away)?.key).toBe("before:15");
    expect(dueReminder(r, shift, at("09:55"), away)?.key).toBe("before:5");
    expect(dueReminder(r, shift, at("09:00"), working)).toBeNull();
    expect(dueReminder(r, shift, at("08:30"), away)).toBeNull();
  });

  it("reminds every 20 minutes while late, then stops", () => {
    expect(dueReminder(r, shift, at("10:05"), away)).toBeNull();
    const first = dueReminder(r, shift, at("10:20"), away);
    expect(first?.key).toBe("late:1");
    expect(first?.text).toContain("20 daqiqa kechikyapsiz");
    expect(dueReminder(r, shift, at("11:25"), away)?.text).toContain("1 soat 25 daqiqa");
    expect(dueReminder(r, shift, at("13:20"), away)).toBeNull();
  });

  it("warns before the end and at it, never after", () => {
    expect(dueReminder(r, shift, at("18:30"), working)?.text).toContain("30 daqiqa qoldi");
    expect(dueReminder(r, shift, at("18:55"), working)?.key).toBe("end-5");
    expect(dueReminder(r, shift, at("19:00"), working)?.key).toBe("end");
    expect(dueReminder(r, shift, at("19:20"), working)).toBeNull();
    expect(dueReminder(r, shift, at("18:30"), { ...working, open: false })).toBeNull();
  });

  it("is quiet when off, on days off and with the name filled in", () => {
    expect(dueReminder(DEFAULT_REMINDERS, shift, at("09:00"), away)).toBeNull();
    expect(dueReminder(r, shift, at("09:00", 6), away)).toBeNull();
    expect(dueReminder(r, shift, at("09:00"), away)?.text).toContain("Aziz,");
  });
});

describe("parseReminders", () => {
  it("cleans what is stored", () => {
    const p = parseReminders({
      enabled: true,
      before: [5, 60, 60, -1, 999, 30],
      lateEvery: 15,
      endBefore: [],
      endAt: false,
      texts: { late: "  Kech: {late}  ", end: "" },
    });
    expect(p.before).toEqual([60, 30, 5]);
    expect(p.lateEvery).toBe(15);
    expect(p.endBefore).toEqual([]);
    expect(p.endAt).toBe(false);
    expect(p.texts.late).toBe("Kech: {late}");
    expect(p.texts.end).toBe(DEFAULT_REMINDERS.texts.end);
    expect(parseReminders(null)).toEqual(DEFAULT_REMINDERS);
  });

  it("writes durations in words", () => {
    expect(minutesText(45)).toBe("45 daqiqa");
    expect(minutesText(60)).toBe("1 soat");
    expect(minutesText(80)).toBe("1 soat 20 daqiqa");
  });
});
