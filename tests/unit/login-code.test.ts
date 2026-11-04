import { formatCode, maskEmail, pickChannel, resendWait } from "@/lib/login-code";

describe("login code", () => {
  it("prefers email, falls back to Telegram, else asks nothing", () => {
    expect(pickChannel({ smtpReady: true, email: "a@b.uz", telegramChatId: 1 })).toBe("email");
    expect(pickChannel({ smtpReady: false, email: "a@b.uz", telegramChatId: 1 })).toBe("telegram");
    expect(pickChannel({ smtpReady: false, email: "a@b.uz", telegramChatId: null })).toBeNull();
    expect(pickChannel({ smtpReady: true, email: null, telegramChatId: null })).toBeNull();
  });

  it("masks the email and pads the code", () => {
    expect(maskEmail("umidbek@gmail.com")).toBe("u*****@gmail.com");
    expect(maskEmail("ab@x.uz")).toBe("a**@x.uz");
    expect(formatCode(42)).toBe("000042");
    expect(formatCode(1_234_567)).toBe("234567");
  });

  it("waits a minute before sending again", () => {
    const now = Date.parse("2026-11-04T10:00:30Z");
    expect(resendWait(null, now)).toBe(0);
    expect(resendWait("2026-11-04T10:00:00Z", now)).toBe(30);
    expect(resendWait("2026-11-04T09:58:00Z", now)).toBe(0);
  });
});
