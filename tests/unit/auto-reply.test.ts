import {
  companyWorkHours,
  isWorkingTime,
  matchResponder,
  pickAutoReply,
  type Responder,
} from "@/lib/auto-reply";
import { formatDateAs } from "@/lib/utils";

// Tashkent is UTC+5 all year.
const tash = (iso: string) => new Date(`${iso}+05:00`);
const weekdays = { start_time: "09:00:00", end_time: "18:00:00", work_days: [1, 2, 3, 4, 5] };

const r = (id: string, trigger: string, channels: string[] = [], active = true): Responder => ({
  id,
  trigger_text: trigger,
  message: `reply ${id}`,
  channels,
  active,
});

describe("auto reply", () => {
  it("knows working hours in the company's time zone", () => {
    // Thursday 5 Nov 2026
    expect(isWorkingTime(weekdays, tash("2026-11-05T09:00:00"), "Asia/Tashkent")).toBe(true);
    expect(isWorkingTime(weekdays, tash("2026-11-05T17:59:00"), "Asia/Tashkent")).toBe(true);
    expect(isWorkingTime(weekdays, tash("2026-11-05T18:00:00"), "Asia/Tashkent")).toBe(false);
    expect(isWorkingTime(weekdays, tash("2026-11-05T08:30:00"), "Asia/Tashkent")).toBe(false);
    // Saturday
    expect(isWorkingTime(weekdays, tash("2026-11-07T12:00:00"), "Asia/Tashkent")).toBe(false);
  });

  it("handles an overnight shift", () => {
    const night = { start_time: "20:00", end_time: "04:00", work_days: [5] }; // Friday night
    expect(isWorkingTime(night, tash("2026-11-06T23:00:00"), "Asia/Tashkent")).toBe(true);
    expect(isWorkingTime(night, tash("2026-11-07T03:00:00"), "Asia/Tashkent")).toBe(true);
    expect(isWorkingTime(night, tash("2026-11-07T05:00:00"), "Asia/Tashkent")).toBe(false);
  });

  it("matches keywords, channels and skips paused rules", () => {
    const rules = [
      r("off", "narx", [], false),
      r("ig", "narx", ["instagram"]),
      r("all", "narx, price"),
    ];
    expect(matchResponder("Kursning NARXI qancha?", "telegram", rules)?.id).toBe("all");
    expect(matchResponder("narx?", "instagram", rules)?.id).toBe("ig");
    expect(matchResponder("salom", "telegram", rules)).toBeNull();
    expect(matchResponder("price", "telegram", [r("bot", "price", ["telegram_bot"])])?.id).toBe(
      "bot",
    );
  });

  it("answers out of hours first, otherwise by keyword", () => {
    const base = { text: "narx", channel: "telegram" as const, responders: [r("a", "narx")] };
    expect(
      pickAutoReply({ ...base, working: false, afterHours: { enabled: true, text: "Ertaga" } }),
    ).toEqual({ kind: "after_hours", key: "after_hours", text: "Ertaga" });
    expect(
      pickAutoReply({ ...base, working: true, afterHours: { enabled: true, text: "Ertaga" } })
        ?.kind,
    ).toBe("responder");
    expect(
      pickAutoReply({ ...base, working: false, afterHours: { enabled: false, text: "Ertaga" } })
        ?.kind,
    ).toBe("responder");
  });

  it("writes dates in the picked format", () => {
    const d = new Date(2026, 10, 5);
    expect(formatDateAs(d, "dd.mm.yyyy")).toBe("05.11.2026");
    expect(formatDateAs(d, "yyyy-mm-dd")).toBe("2026-11-05");
    expect(formatDateAs(d, "mm/dd/yyyy")).toBe("11/05/2026");
    expect(formatDateAs(d, "d mmm yyyy")).toBe("5 Nov 2026");
  });
});

describe("companyWorkHours", () => {
  const legacy = { start_time: "10:00:00", end_time: "19:00:00", work_days: [1, 2, 3] };
  it("uses the main shift from Davomat, the one place hours are set", () => {
    expect(
      companyWorkHours(
        { shifts: [{ start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5, 9] }] },
        legacy,
      ),
    ).toEqual({ start_time: "09:00", end_time: "18:00", work_days: [1, 2, 3, 4, 5] });
  });
  it("falls back to the older schedule, else none", () => {
    expect(companyWorkHours({}, legacy)).toBe(legacy);
    expect(companyWorkHours(null, null)).toBeNull();
  });
});
