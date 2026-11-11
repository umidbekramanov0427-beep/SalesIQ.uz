import { findCardNumbers, parseReplyRules } from "@/lib/reply-rules";
import { alertDue, speedLevel, waitingBadge } from "@/lib/speed-to-lead";

describe("reply rules", () => {
  it("falls back on bad values and keeps the second limit above the first", () => {
    expect(parseReplyRules(null)).toEqual({
      warnMinutes: 5,
      escalateMinutes: 15,
      cardWarning: true,
    });
    expect(parseReplyRules({ warnMinutes: 10, escalateMinutes: 3, cardWarning: false })).toEqual({
      warnMinutes: 10,
      escalateMinutes: 10,
      cardWarning: false,
    });
    expect(parseReplyRules({ warnMinutes: -1, escalateMinutes: "x" }).warnMinutes).toBe(5);
    expect(parseReplyRules({ warnMinutes: 99999 }).warnMinutes).toBe(5);
  });

  it("finds Uzcard, Humo and Visa numbers written any way, masked", () => {
    const text =
      "Pulni 8600 4954 7331 6023 ga, yoki 9860-1001-2345-6780 ga, yoki 4111111111111111 ga tashlang";
    expect(findCardNumbers(text)).toEqual([
      { brand: "Uzcard", masked: "8600 •••• •••• 6023" },
      { brand: "Humo", masked: "9860 •••• •••• 6780" },
      { brand: "Visa", masked: "4111 •••• •••• 1111" },
    ]);
  });

  it("ignores phones, order numbers and failing checksums", () => {
    expect(findCardNumbers("+998 90 482 37 15, buyurtma 12345678901234567")).toEqual([]);
    expect(findCardNumbers("8600 4954 7331 6024")).toEqual([]);
    expect(findCardNumbers("")).toEqual([]);
  });

  it("uses the company's own limits for the timer and the alerts", () => {
    const created = new Date("2026-11-11T10:00:00Z");
    const at = (min: number) => new Date(created.getTime() + min * 60_000);
    const rules = { warnMinutes: 2, escalateMinutes: 4 };
    expect(speedLevel(created, at(3), rules)).toBe(1);
    expect(speedLevel(created, at(3))).toBe(0);
    expect(waitingBadge(created, at(5), rules).tone).toBe("late");
    expect(
      alertDue(
        { createdAt: created, contacted: false, closed: false, alertedLevel: 0 },
        at(4),
        rules,
      ),
    ).toBe(2);
  });
});
