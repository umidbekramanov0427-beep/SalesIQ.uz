import { nextOccurrence, quickTimes, reminderGroup } from "@/lib/reminders";

const at = (s: string) => new Date(s).getTime();

describe("reminders", () => {
  it("moves a repeating reminder past now", () => {
    const now = at("2026-11-12T10:00:00");
    expect(nextOccurrence("2026-11-12T09:00:00", "none", now)).toBeNull();
    expect(nextOccurrence("2026-11-12T09:00:00", "daily", now)?.getDate()).toBe(13);
    expect(nextOccurrence("2026-11-05T09:00:00", "weekly", now)?.getDate()).toBe(19);
    expect(nextOccurrence("2026-10-12T09:00:00", "monthly", now)?.getMonth()).toBe(11);
    // Friday 13 Nov 09:00 -> already Friday next time from Thursday? From Fri 10:00 -> Monday.
    const fri = at("2026-11-13T10:00:00");
    expect(nextOccurrence("2026-11-13T09:00:00", "weekdays", fri)?.getDay()).toBe(1);
  });

  it("groups by due, today, upcoming and done", () => {
    const now = at("2026-11-12T10:00:00");
    const r = (remind_at: string, done = false) => ({
      remind_at: new Date(remind_at).toISOString(),
      done_at: done ? "x" : null,
      sent_at: null,
    });
    expect(reminderGroup(r("2026-11-12T09:00:00"), now)).toBe("due");
    expect(reminderGroup(r("2026-11-12T18:00:00"), now)).toBe("today");
    expect(reminderGroup(r("2026-11-13T09:00:00"), now)).toBe("upcoming");
    expect(reminderGroup(r("2026-11-12T18:00:00", true), now)).toBe("done");
  });

  it("offers in an hour, this evening and tomorrow morning", () => {
    const q = quickTimes(at("2026-11-12T19:30:00"));
    expect(q.map((x) => x.key)).toEqual(["hour", "evening", "morning"]);
    expect(q[1]!.at.getDate()).toBe(13);
    expect(q[2]!.at.getHours()).toBe(9);
  });
});
