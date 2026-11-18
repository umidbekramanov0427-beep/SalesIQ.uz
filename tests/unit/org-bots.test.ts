import {
  salesbotCodeFromStart,
  salesbotIdFromStart,
  salesbotShortUrl,
  salesbotStartUrl,
} from "@/lib/salesbots/start-link";
import { sharedBotClosedText, sharedBotDaysLeft, sharedBotOpen } from "@/lib/telegram/shared-bot";

describe("shared trial bot", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  it("is open until the company's date, then closed", () => {
    expect(sharedBotOpen({ shared_bot_until: "2026-11-20T00:00:00Z" }, now)).toBe(true);
    expect(sharedBotOpen({ shared_bot_until: "2026-11-15T09:59:00Z" }, now)).toBe(false);
    expect(sharedBotOpen({ shared_bot_until: null }, now)).toBe(false);
    expect(sharedBotOpen({}, now)).toBe(true); // before the migration
    expect(sharedBotOpen(null, now)).toBe(false);
  });
  it("counts the days left", () => {
    expect(sharedBotDaysLeft("2026-11-29T10:00:00Z", now)).toBe(14);
    expect(sharedBotDaysLeft("2026-11-15T11:00:00Z", now)).toBe(1);
    expect(sharedBotDaysLeft("2026-11-01T00:00:00Z", now)).toBe(0);
    expect(sharedBotDaysLeft(null, now)).toBeNull();
  });
  it("points the client to the company's own bot", () => {
    expect(sharedBotClosedText("KursBot")).toContain("https://t.me/KursBot");
    expect(sharedBotClosedText(null)).toContain("ishlamayapti");
  });
});

describe("salesbot links", () => {
  it("reads short and long start payloads", () => {
    expect(salesbotCodeFromStart("/start s_a1b2c3")).toBe("a1b2c3");
    expect(salesbotCodeFromStart("/start S_A1B2C3 ")).toBe("a1b2c3");
    expect(salesbotCodeFromStart("/start sb_" + "a".repeat(32))).toBeNull();
    expect(salesbotCodeFromStart("/start ABCD1234")).toBeNull();
    const id = "0123abcd-0000-4000-8000-0000000000ff";
    expect(
      salesbotIdFromStart(
        salesbotStartUrl("Bot", id).replace("https://t.me/Bot?start=", "/start "),
      ),
    ).toBe(id);
  });
  it("makes short links, and the plain link for the main salesbot", () => {
    expect(salesbotShortUrl("KursBot", "a1b2c3")).toBe("https://t.me/KursBot?start=s_a1b2c3");
    expect(salesbotShortUrl("KursBot", "a1b2c3", true)).toBe("https://t.me/KursBot");
    expect(salesbotShortUrl("KursBot", null)).toBeNull();
  });
});
