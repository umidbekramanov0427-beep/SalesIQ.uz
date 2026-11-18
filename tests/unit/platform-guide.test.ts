import { guideRules, pageIndex, setupProgress, telegramLink } from "@/lib/ai/platform-guide";

describe("AI platform guide", () => {
  it("lists catalog pages as markdown links", () => {
    const text = pageIndex({ "settings.nav.profile": "Profil" });
    expect(text).toContain("[Profil](/settings?section=profile)");
    expect(text.split("\n").length).toBeGreaterThan(10);
  });

  it("normalises the support Telegram", () => {
    expect(telegramLink("@salesiq_support")).toBe("https://t.me/salesiq_support");
    expect(telegramLink("t.me/salesiq_support")).toBe("https://t.me/salesiq_support");
    expect(telegramLink("")).toBeNull();
  });

  it("hands admins to the Operator tab and others to Telegram", () => {
    expect(guideRules("super_admin", { telegram: "x_support", phone: null })).toContain(
      "(#operator)",
    );
    const rep = guideRules("sotuv_menejeri", { telegram: "x_support", phone: null });
    expect(rep).toContain("https://t.me/x_support");
    expect(rep).not.toContain("#operator");
    expect(guideRules("rop", { telegram: null, phone: null })).toContain("company admin");
  });
});

describe("AI setup progress", () => {
  it("names the next step with its link and the own bot", () => {
    const text = setupProgress(
      { bot: true, team: false, lead: false, integration: false, business: true },
      false,
    );
    expect(text).toContain("DONE: Link your own Telegram");
    expect(text).toContain("the next step is: [Add the team (employees)](/admin/employees)");
    expect(text).toContain("(/integrations/telegram-bot)");
  });
  it("suggests deeper setup when everything is done", () => {
    const all = { bot: true, team: true, lead: true, integration: true, business: true };
    expect(setupProgress(all, true)).toContain("All first steps are done");
  });
});
