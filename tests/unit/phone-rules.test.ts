import { checkPhone, cleanPhone } from "@/lib/leads/intake-clean";
import { displayPhone, parsePhoneRules, type PhoneRules } from "@/lib/phone-rules";

const uz: PhoneRules = { countries: ["UZ"], onlyListed: false };
const uzRu: PhoneRules = { countries: ["UZ", "RU", "KZ"], onlyListed: false };
const ruFirst: PhoneRules = { countries: ["RU", "UZ"], onlyListed: false };
const kgTj: PhoneRules = { countries: ["KG", "TJ", "UZ"], onlyListed: false };

describe("phone rules", () => {
  it("defaults to Uzbekistan and drops unknown countries", () => {
    expect(parsePhoneRules(null)).toEqual({ countries: ["UZ"], onlyListed: false });
    expect(parsePhoneRules({ countries: ["XX", "RU", "RU"], onlyListed: true })).toEqual({
      countries: ["RU"],
      onlyListed: true,
    });
    expect(parsePhoneRules({ countries: [] }).countries).toEqual(["UZ"]);
  });

  it("reads Russian and Kazakh local numbers when the company lists them", () => {
    expect(cleanPhone("8 916 482 37 15", uz)).toBeNull();
    expect(cleanPhone("8 916 482 37 15", uzRu)).toBe("+79164823715");
    expect(cleanPhone("916 482 37 15", uzRu)).toBe("+79164823715");
    expect(cleanPhone("8 701 555 42 18", uzRu)).toBe("+77015554218");
    // Uzbek numbers still read first.
    expect(cleanPhone("90 123 45 60", uzRu)).toBe("+998901234560");
    expect(cleanPhone("8 90 123 45 60", uzRu)).toBe("+998901234560");
  });

  it("reads a 9-digit number as the first listed country it fits", () => {
    expect(cleanPhone("700 482 915", kgTj)).toBe("+996700482915");
    expect(cleanPhone("0700 482 915", kgTj)).toBe("+996700482915");
    expect(cleanPhone("90 123 45 60", uz)).toBe("+998901234560");
    expect(cleanPhone("90 482 37 15", kgTj)).toBe("+996904823715");
    expect(cleanPhone("+998 90 123 45 60", kgTj)).toBe("+998901234560");
  });

  it("keeps the order: Russia first reads 10 digits as Russian", () => {
    expect(cleanPhone("9164823715", ruFirst)).toBe("+79164823715");
    expect(cleanPhone("901234560", ruFirst)).toBe("+998901234560");
  });

  it("turns away other countries only when asked", () => {
    const only: PhoneRules = { countries: ["UZ", "RU"], onlyListed: true };
    expect(checkPhone("+82 10 9876 5121", only)).toEqual({ ok: false, reason: "country" });
    expect(checkPhone("+7 701 555 42 18", only)).toEqual({ ok: false, reason: "country" });
    expect(cleanPhone("+7 916 482 37 15", only)).toBe("+79164823715");
    expect(cleanPhone("+82 10 9876 5121", uz)).toBe("+821098765121");
  });

  it("still refuses made-up numbers in every country", () => {
    expect(checkPhone("8 999 999 99 99", uzRu)).toEqual({ ok: false, reason: "fake" });
    expect(checkPhone("90 000 00 00", uzRu)).toEqual({ ok: false, reason: "fake" });
    expect(checkPhone("+998 20 123 45 67", uz)).toEqual({ ok: false, reason: "invalid" });
  });

  it("shows stored numbers with spaces", () => {
    expect(displayPhone("+998901234560")).toBe("+998 90 123 45 60");
    expect(displayPhone("+79164823715")).toBe("+7 916 482 37 15");
    expect(displayPhone("12345")).toBe("12345");
  });
});
