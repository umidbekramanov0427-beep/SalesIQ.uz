import { alertDue, speedLevel, waitingBadge } from "@/lib/speed-to-lead";

const t0 = new Date("2026-10-28T10:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);
const lead = (extra: Partial<Parameters<typeof alertDue>[0]> = {}) => ({
  createdAt: t0,
  contacted: false,
  closed: false,
  alertedLevel: 0,
  ...extra,
});

describe("speed to lead", () => {
  it("reminds at 5 minutes and escalates at 15", () => {
    expect(speedLevel(t0, at(4))).toBe(0);
    expect(speedLevel(t0, at(5))).toBe(1);
    expect(speedLevel(t0, at(15))).toBe(2);
  });

  it("tells each level once", () => {
    expect(alertDue(lead(), at(3))).toBeNull();
    expect(alertDue(lead(), at(6))).toBe(1);
    expect(alertDue(lead({ alertedLevel: 1 }), at(10))).toBeNull();
    expect(alertDue(lead({ alertedLevel: 1 }), at(16))).toBe(2);
    expect(alertDue(lead({ alertedLevel: 2 }), at(60))).toBeNull();
    // A lead first seen late goes straight to the head of sales.
    expect(alertDue(lead(), at(40))).toBe(2);
  });

  it("stays quiet once the lead is contacted, closed or old", () => {
    expect(alertDue(lead({ contacted: true }), at(20))).toBeNull();
    expect(alertDue(lead({ closed: true }), at(20))).toBeNull();
    expect(alertDue(lead(), at(25 * 60))).toBeNull();
  });

  it("colours the card timer", () => {
    expect(waitingBadge(t0, at(2))).toEqual({ minutes: 2, tone: "calm" });
    expect(waitingBadge(t0, at(7))).toEqual({ minutes: 7, tone: "warn" });
    expect(waitingBadge(t0, at(31))).toEqual({ minutes: 31, tone: "late" });
  });
});
