import {
  clampDay,
  firstRunOn,
  inSendingHours,
  nextMonthOn,
  paymentLinkText,
  tashkentToday,
} from "@/lib/lead-payments/recurring";

describe("recurring payment calendar", () => {
  it("uses the Tashkent date", () => {
    // 20:30 UTC is already the next day in Tashkent (UTC+5).
    expect(tashkentToday(Date.parse("2026-10-16T20:30:00Z"))).toBe("2026-10-17");
    expect(tashkentToday(Date.parse("2026-10-16T18:00:00Z"))).toBe("2026-10-16");
  });

  it("sends only in the daytime", () => {
    expect(inSendingHours(Date.parse("2026-10-16T03:59:00Z"))).toBe(false); // 08:59
    expect(inSendingHours(Date.parse("2026-10-16T04:00:00Z"))).toBe(true); // 09:00
    expect(inSendingHours(Date.parse("2026-10-16T16:00:00Z"))).toBe(false); // 21:00
  });

  it("keeps the day within 1..28", () => {
    expect(clampDay(16)).toBe(16);
    expect(clampDay("5")).toBe(5);
    expect(clampDay(29)).toBeNull();
    expect(clampDay(0)).toBeNull();
  });

  it("moves to the next month, across the year end", () => {
    expect(nextMonthOn(5, "2026-10-16")).toBe("2026-11-05");
    expect(nextMonthOn(28, "2026-12-28")).toBe("2027-01-28");
  });

  it("starts this month when the day is ahead and nothing was sent", () => {
    expect(firstRunOn(20, "2026-10-16", false)).toBe("2026-10-20");
    expect(firstRunOn(16, "2026-10-16", false)).toBe("2026-11-16");
    expect(firstRunOn(20, "2026-10-16", true)).toBe("2026-11-20");
  });

  it("writes the client message", () => {
    expect(paymentLinkText({ amount: 990000, description: "Oktabr" }, "https://x/pay/1")).toBe(
      "Oktabr\nTo'lov: 990 000 so'm\nPayme yoki Click orqali to'lash: https://x/pay/1",
    );
  });
});
