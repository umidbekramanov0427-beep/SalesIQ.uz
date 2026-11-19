import {
  codeMessage,
  formatCode,
  normalizeCode,
  parseLogin,
  passwordProblem,
  triesLeft,
} from "@/lib/password-reset";

describe("password reset rules", () => {
  it("reads an e-mail or a phone number", () => {
    expect(parseLogin("  Ali@Firma.UZ ")).toEqual({ kind: "email", email: "ali@firma.uz" });
    expect(parseLogin("+998 90 123-45-67")).toEqual({ kind: "phone", key: "998901234567" });
    expect(parseLogin("90 123 45 67")).toEqual({ kind: "phone", key: "998901234567" });
    expect(parseLogin("ali@")).toBeNull();
    expect(parseLogin("ali")).toBeNull();
    expect(parseLogin("123")).toBeNull();
    expect(parseLogin("")).toBeNull();
  });

  it("accepts a six-digit code with spaces or a dash", () => {
    expect(normalizeCode("123456")).toBe("123456");
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12345a")).toBeNull();
  });

  it("always makes six digits", () => {
    expect(formatCode(7)).toBe("000007");
    expect(formatCode(999_999)).toBe("999999");
    expect(formatCode(1_234_567)).toBe("234567");
  });

  it("checks the new password's length", () => {
    expect(passwordProblem("1234567")).toBe("short");
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("x".repeat(73))).toBe("long");
  });

  it("counts the tries left on the open codes", () => {
    expect(triesLeft([])).toBe(0);
    expect(triesLeft([0])).toBe(5);
    expect(triesLeft([4, 2])).toBe(3);
    expect(triesLeft([7])).toBe(0);
  });

  it("writes the code message with the first name, escaped", () => {
    const m = codeMessage("042517", "Umidbek <Ramanov>");
    expect(m).toContain("<code>042517</code>");
    expect(m).toContain("Umidbek, ");
    expect(codeMessage("1", "<b>")).toContain("&lt;b&gt;");
    expect(codeMessage("1", null)).not.toContain(", SalesIQ");
  });
});
