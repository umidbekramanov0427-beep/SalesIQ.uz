import { pickToken, tokenSource } from "@/lib/bot-token-pick";

describe("platform bot token choice", () => {
  it("prefers the panel token over the server setting", () => {
    expect(pickToken("111:panel", "222:env")).toBe("111:panel");
    expect(tokenSource("111:panel", "222:env")).toBe("panel");
  });
  it("falls back to the server setting", () => {
    expect(pickToken(null, "222:env")).toBe("222:env");
    expect(pickToken("  ", "222:env")).toBe("222:env");
    expect(tokenSource(null, "222:env")).toBe("env");
  });
  it("is empty when neither is set", () => {
    expect(pickToken(null, undefined)).toBe(null);
    expect(tokenSource(undefined, "")).toBe(null);
  });
});
