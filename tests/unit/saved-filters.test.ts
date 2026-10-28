import { decodeFilters, encodeFilters, savedFiltersKey } from "@/lib/saved-filters";
import { datePresetRange } from "@/lib/date-presets";

describe("saved filters", () => {
  it("keys per user and page", () => {
    expect(savedFiltersKey("u1", "audio")).toBe("salesiq.filters.v1.u1.audio");
  });

  it("round-trips plain values and custom dates", () => {
    const value = {
      funnel: "Sotuv",
      tags: ["vip"],
      date: {
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-10-05T00:00:00Z"),
        label: "1–5",
        preset: "custom",
      },
    };
    const back = decodeFilters<typeof value>(encodeFilters(value))!;
    expect(back.funnel).toBe("Sotuv");
    expect(back.tags).toEqual(["vip"]);
    expect(back.date.from).toEqual(value.date.from);
    expect(back.date.to).toEqual(value.date.to);
  });

  it("recomputes a preset's dates on load instead of keeping the old ones", () => {
    const savedOn = new Date("2026-01-10T12:00:00");
    const raw = encodeFilters({
      date: { ...datePresetRange("7d", savedOn)!, label: "7 kun", preset: "7d" },
    });
    expect(raw).not.toContain("2026-01");
    const now = new Date("2026-10-28T09:00:00");
    const back = decodeFilters<{ date: { from: Date; to: Date } }>(raw, now)!;
    expect(back.date.from).toEqual(datePresetRange("7d", now)!.from);
  });

  it("encodes the same state the same way whatever the key order", () => {
    expect(encodeFilters({ a: 1, b: 2 })).toBe(encodeFilters({ b: 2, a: 1 }));
  });

  it("reads broken storage as nothing saved", () => {
    expect(decodeFilters("{oops")).toBeNull();
    expect(decodeFilters(null)).toBeNull();
  });
});
