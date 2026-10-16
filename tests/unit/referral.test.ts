import {
  commissionFor,
  makeCode,
  normalizeCode,
  referralLink,
  withinCommissionWindow,
} from "@/lib/referral";

describe("referral codes", () => {
  it("normalizes and validates codes", () => {
    expect(normalizeCode(" baraka7kq ")).toBe("BARAKA7KQ");
    expect(normalizeCode("ab")).toBeNull();
    expect(normalizeCode("has space")).toBeNull();
    expect(normalizeCode("x".repeat(17))).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });

  it("makes a readable code from the company name", () => {
    let i = 0;
    const seq = () => [0, 0.5, 0.99][i++ % 3]!;
    expect(makeCode("Baraka Savdo MChJ", seq)).toMatch(/^BARAKA[A-Z2-9]{3}$/);
    expect(makeCode("Шарк Трейд", seq)).toMatch(/^SHARK[A-Z2-9]{3}$/);
    expect(makeCode("!!", seq)).toMatch(/^SIQ[A-Z2-9]{3}$/);
    expect(normalizeCode(makeCode("O'zbek Savdo"))).not.toBeNull();
  });

  it("builds the public link", () => {
    expect(referralLink("ABC123")).toBe("https://salesiq.uz/?ref=ABC123");
    expect(referralLink("ABC123", "http://127.0.0.1:5181")).toBe(
      "http://127.0.0.1:5181/?ref=ABC123",
    );
  });
});

describe("partner commission", () => {
  it("is a rounded share of the payment", () => {
    expect(commissionFor(399_000, 20)).toBe(79_800);
    expect(commissionFor(399_000, 0)).toBe(0);
    expect(commissionFor(0, 20)).toBe(0);
    expect(commissionFor(100, 150)).toBe(100);
  });

  it("is paid for 12 months after the invitation", () => {
    const since = "2026-01-15T00:00:00Z";
    expect(withinCommissionWindow(since, Date.parse("2026-12-31T00:00:00Z"))).toBe(true);
    expect(withinCommissionWindow(since, Date.parse("2027-01-16T00:00:00Z"))).toBe(false);
  });
});
