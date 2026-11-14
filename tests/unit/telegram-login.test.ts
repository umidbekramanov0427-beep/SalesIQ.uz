import { LOGIN_START_RE, tokenForSecret } from "@/lib/telegram-login.server";

describe("Telegram sign-in requests", () => {
  it("bind the t.me link to the page's secret by hash", () => {
    const a = tokenForSecret("secret-of-one-page-aaaaaaaa");
    expect(a).toMatch(/^[a-f0-9]{40}$/);
    expect(tokenForSecret("secret-of-one-page-aaaaaaaa")).toBe(a);
    expect(tokenForSecret("secret-of-another-page-bbbb")).not.toBe(a);
  });

  it("only take a well-formed /start login_ payload", () => {
    const token = tokenForSecret("x".repeat(32));
    expect(`/start login_${token}`).toMatch(LOGIN_START_RE);
    expect("/start login_abc").not.toMatch(LOGIN_START_RE);
    expect(`/start login_${token}; drop`).not.toMatch(LOGIN_START_RE);
  });
});
