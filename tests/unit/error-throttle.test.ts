import { MAX_PER_PAGE, newThrottleState, shouldReportError } from "@/lib/error-throttle";

describe("shouldReportError", () => {
  it("sends the same error on the same page once a minute", () => {
    const s = newThrottleState();
    expect(shouldReportError(s, "boom", "/dashboard", 0)).toBe(true);
    expect(shouldReportError(s, "boom", "/dashboard", 30_000)).toBe(false);
    expect(shouldReportError(s, "boom", "/settings", 30_000)).toBe(true);
    expect(shouldReportError(s, "boom", "/dashboard", 61_000)).toBe(true);
  });

  it("stops after the per-page limit", () => {
    const s = newThrottleState();
    for (let i = 0; i < MAX_PER_PAGE; i++) {
      expect(shouldReportError(s, `e${i}`, "/", 0)).toBe(true);
    }
    expect(shouldReportError(s, "one more", "/", 0)).toBe(false);
  });

  it("skips the browser's ResizeObserver notice", () => {
    const s = newThrottleState();
    expect(
      shouldReportError(s, "ResizeObserver loop completed with undelivered notifications.", "/", 0),
    ).toBe(false);
  });
});
