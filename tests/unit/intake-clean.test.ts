import {
  checkPhone,
  cleanLeadName,
  cleanPhone,
  isJunkName,
  isSpamLead,
} from "@/lib/leads/intake-clean";

describe("checkPhone", () => {
  it("writes every Uzbek number as +998XXXXXXXXX", () => {
    for (const raw of [
      "901234560",
      "998 90 123 45 60",
      "+998 (90) 123-45-60",
      "8 90 123 45 60",
      "00998901234560",
    ]) {
      expect(cleanPhone(raw)).toBe("+998901234560");
    }
    expect(cleanPhone("+998 71 200 30 40")).toBe("+998712003040");
  });

  it("keeps foreign numbers typed with their country code", () => {
    expect(cleanPhone("+7 701 555 42 18")).toBe("+77015554218");
    expect(cleanPhone("77015554218")).toBe("+77015554218");
    expect(cleanPhone("+82 10 9876 5121")).toBe("+821098765121");
  });

  it("refuses made-up numbers", () => {
    for (const raw of [
      "+21312312312",
      "999999999",
      "+998 90 000 00 00",
      "991234567",
      "+7 111 111 11 11",
    ]) {
      expect(checkPhone(raw)).toEqual({ ok: false, reason: "fake" });
    }
  });

  it("keeps Uzbek beautiful numbers, which are real", () => {
    expect(cleanPhone("+998 90 777 77 77")).toBe("+998907777777");
    expect(cleanPhone("90 505 05 05")).toBe("+998905050505");
    expect(cleanPhone("901111111")).toBe("+998901111111");
  });

  it("refuses what is not a phone", () => {
    expect(checkPhone("")).toEqual({ ok: false, reason: "empty" });
    expect(checkPhone("abc")).toEqual({ ok: false, reason: "invalid" });
    expect(checkPhone("12345")).toEqual({ ok: false, reason: "invalid" });
    expect(checkPhone("201234567")).toEqual({ ok: false, reason: "invalid" });
    expect(checkPhone("4155552671")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("lead names", () => {
  it("recognises junk names", () => {
    expect(isJunkName("...")).toBe(true);
    expect(isJunkName("Buy now https://spam.xyz")).toBe(true);
    expect(isJunkName("优惠活动")).toBe(true);
    expect(isJunkName("Aziza")).toBe(false);
    expect(isJunkName("Азиза Каримова")).toBe(false);
  });

  it("moves a message out of the name field", () => {
    const long = "Assalomu alaykum, kurslaringiz haqida batafsil ma'lumot bersangiz, narxi qancha?";
    expect(cleanLeadName(long, "+998901234560")).toEqual({
      name: "Mijoz +998901234560",
      movedText: long,
    });
    expect(cleanLeadName("Aziza\nnarxi qancha", null)).toEqual({
      name: "Mijoz",
      movedText: "Aziza\nnarxi qancha",
    });
    expect(cleanLeadName("  Aziza   Karimova ", null)).toEqual({
      name: "Aziza Karimova",
      movedText: null,
    });
    expect(cleanLeadName("...", "+998901234560").name).toBe("Mijoz +998901234560");
  });

  it("calls a lead spam only when nobody can be reached", () => {
    expect(isSpamLead({ name: "SEO promotion http://x.ru", phone: "", email: "" })).toBe(true);
    expect(isSpamLead({ name: "优惠", phone: "+21312312312" })).toBe(true);
    expect(isSpamLead({ name: "SEO http://x.ru", phone: "901234560" })).toBe(false);
    expect(isSpamLead({ name: "Aziza", phone: "", email: "" })).toBe(false);
  });
});
