import { DEFAULT_PREFS, readPrefs, vcardCode } from "@/lib/profile-prefs";
import { qrMatrix } from "@/lib/qr";

describe("readPrefs", () => {
  it("fills what is missing and drops what is wrong", () => {
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(readPrefs({ fontSize: "xl", dateFormat: "nope", timezone: "UTC" })).toEqual({
      ...DEFAULT_PREFS,
      fontSize: "xl",
      timezone: "UTC",
    });
  });
});

describe("vcardCode", () => {
  it("is long enough and has no look-alike letters", () => {
    const c = vcardCode();
    expect(c).toHaveLength(12);
    expect(c).not.toMatch(/[01ilIoO]/);
  });
});

describe("qrMatrix", () => {
  it("draws the smallest version that fits, with its finder patterns", () => {
    const short = qrMatrix("hi");
    expect(short).toHaveLength(21);
    const link = qrMatrix("https://salesiq.uz/card/abcdEFGH1234");
    expect(link).toHaveLength(29);
    // Finder pattern: dark ring, light ring, dark 3x3 core.
    for (const m of [short, link]) {
      expect(m[0]![0]).toBe(true);
      expect(m[1]![1]).toBe(false);
      expect(m[3]![3]).toBe(true);
      expect(m[0]![m.length - 1]).toBe(true);
      expect(m[m.length - 1]![0]).toBe(true);
    }
  });
  it("refuses text that does not fit", () => {
    expect(() => qrMatrix("x".repeat(400))).toThrow();
  });
});
