import { stageOf } from "@/lib/applications";
import {
  companyHealth,
  DEFAULT_MEETING_SETTINGS,
  dueTasks,
  freeSlots,
  isFreeSlot,
  parseMeetingSettings,
  tashkentDay,
  tashkentTime,
} from "@/lib/company-leads";

describe("company lead stages", () => {
  it("renames the old statuses", () => {
    expect(stageOf("contacted")).toBe("taken");
    expect(stageOf("demo")).toBe("meeting");
    expect(stageOf("won")).toBe("installed");
    expect(stageOf("contract")).toBe("contract");
    expect(stageOf("???")).toBe("new");
  });
});

describe("call slots", () => {
  // Monday 2027-01-11 08:00 Tashkent = 03:00 UTC.
  const monday8 = new Date("2027-01-11T03:00:00Z");
  const s = { ...DEFAULT_MEETING_SETTINGS, days: [1, 2, 3, 4, 5], horizonDays: 2 };

  it("offers working hours from leadHours on, in Tashkent time", () => {
    const days = freeSlots(s, [], monday8);
    expect(days[0]!.day).toBe("2027-01-11");
    // 08:00 + 2h lead -> the first slot is 10:00.
    expect(tashkentTime(days[0]!.slots[0]!)).toBe("10:00");
    expect(tashkentTime(days[0]!.slots.at(-1)!)).toBe("17:30");
    expect(days[0]!.slots).toHaveLength(16);
  });

  it("skips booked slots and days off", () => {
    const booked = "2027-01-11T05:00:00.000Z"; // 10:00 Tashkent
    const days = freeSlots(s, [booked], monday8);
    expect(days[0]!.slots).not.toContain(booked);
    expect(isFreeSlot(s, [booked], monday8, booked)).toBe(false);
    expect(isFreeSlot(s, [], monday8, booked)).toBe(true);
    const friday = new Date("2027-01-15T03:00:00Z");
    expect(freeSlots(s, [], friday).map((d) => d.day)).toEqual(["2027-01-15"]);
  });

  it("cleans the stored settings", () => {
    expect(parseMeetingSettings({ days: [9, 2, 2], minutes: 5, from: "25:00" })).toMatchObject({
      days: [2],
      minutes: 15,
      from: DEFAULT_MEETING_SETTINGS.from,
    });
    expect(tashkentDay("2027-01-10T20:00:00Z")).toBe("2027-01-11");
  });
});

describe("company health", () => {
  const base = {
    activeUsers: 4,
    users: 5,
    seatLimit: 10,
    daysLeft: 20,
    openIssues: 0,
    idleDays: 0,
    frozen: false,
  };
  it("is good when people use it", () => {
    expect(companyHealth(base).level).toBe("good");
  });
  it("watches a trial about to end and an open problem", () => {
    const h = companyHealth({ ...base, daysLeft: 2, openIssues: 1 });
    expect(h.level).toBe("watch");
    expect(h.reasons).toEqual(["endsSoon", "issues"]);
  });
  it("flags expired or idle companies", () => {
    expect(companyHealth({ ...base, daysLeft: -1 }).reasons).toContain("expired");
    expect(companyHealth({ ...base, idleDays: 9 }).level).toBe("risk");
    expect(companyHealth({ ...base, users: 0, activeUsers: 0, idleDays: null }).level).toBe("risk");
  });
});

describe("due tasks", () => {
  it("are past due, open and not sent", () => {
    const now = new Date("2027-01-11T10:00:00Z");
    const t = (due: string | null, done: string | null = null, sent: string | null = null) => ({
      due_at: due,
      done_at: done,
      notified_at: sent,
    });
    const list = [
      t("2027-01-11T09:00:00Z"),
      t("2027-01-11T11:00:00Z"),
      t("2027-01-11T09:00:00Z", "x"),
      t("2027-01-11T09:00:00Z", null, "x"),
      t(null),
    ];
    expect(dueTasks(list, now)).toEqual([list[0]]);
  });
});
