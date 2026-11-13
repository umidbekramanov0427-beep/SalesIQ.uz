import { PLAIN_START, staffStartReply } from "@/lib/staff-bot";
import { webhookBase } from "@/lib/bot-tokens-url";

describe("staff bot /start", () => {
  it("recognises a bare /start only", () => {
    expect(PLAIN_START.test("/start")).toBe(true);
    expect(PLAIN_START.test("/start@davomat_bot ")).toBe(true);
    expect(PLAIN_START.test("/start ABCD1234")).toBe(false);
  });

  it("tells a stranger how to link and a linked person what to do", () => {
    expect(staffStartReply(null)).toContain("Sozlamalar → Telegram");
    const linked = staffStartReply({ name: "Umidbek Ramanov" });
    expect(linked).toContain("Umidbek");
    expect(linked).toContain("✅ Keldim");
    expect(linked).toContain("📝 Izoh yozish");
  });
});

describe("webhook base", () => {
  it("is always a public https address", () => {
    expect(webhookBase("https://salesiq.uz/")).toBe("https://salesiq.uz");
    expect(webhookBase("http://127.0.0.1:3000")).toBe("https://salesiq.uz");
    expect(webhookBase(undefined)).toBe("https://salesiq.uz");
    expect(webhookBase(" https://vps.salesiq.uz ")).toBe("https://vps.salesiq.uz");
  });
});
