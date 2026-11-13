import { phoneKey, samePhone } from "@/lib/phone-key";

describe("phone key", () => {
  it("gives every way of writing an Uzbek number one key", () => {
    for (const p of ["+998 90 123-45-67", "998901234567", "90 123 45 67", "8 (90) 123 45 67"])
      expect(phoneKey(p)).toBe("998901234567");
  });

  it("never takes another country's number for an Uzbek one", () => {
    expect(samePhone("+7 990 123 45 67", "+998 90 123 45 67")).toBe(false);
    expect(samePhone("+7 990 123 45 67", "8 990 123 45 67")).toBe(true);
    expect(phoneKey("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("refuses numbers too short to tell", () => {
    expect(phoneKey("12-34")).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(samePhone("", "")).toBe(false);
  });
});
