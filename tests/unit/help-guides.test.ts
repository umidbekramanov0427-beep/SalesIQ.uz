import { HELP_ARTICLES, guideForPath, helpArticle, type L } from "@/lib/help/articles";

const filled = (t: L) => [t.uz, t.ru, t.en].every((s) => s.trim().length > 0);

describe("help guides", () => {
  it("every guide is complete in all three languages", () => {
    for (const a of HELP_ARTICLES) {
      expect(filled(a.title) && filled(a.summary)).toBe(true);
      expect(a.steps.length).toBeGreaterThan(0);
      for (const s of [...a.steps, ...a.notes]) expect(filled(s)).toBe(true);
      for (const f of a.faq) expect(filled(f.q) && filled(f.a)).toBe(true);
      if (a.need) expect(filled(a.need)).toBe(true);
    }
  });

  it("slugs are unique", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("pages open the most specific guide", () => {
    expect(guideForPath("/")).toBe("home");
    expect(guideForPath("/admin")).toBe("start");
    expect(guideForPath("/admin/pipelines")).toBe("pipelines");
    expect(guideForPath("/integrations/amocrm")).toBe("amocrm");
    expect(guideForPath("/crm/leads/123")).toBe("funnels");
    expect(guideForPath("/platform/users")).toBeNull();
  });

  it("every page mapping points at a real guide", () => {
    const paths = [
      "/",
      "/admin",
      "/admin/employees",
      "/admin/telephony",
      "/integrations/telegram-app",
      "/daily-report-settings",
      "/ai-assistant",
      "/content-library",
      "/attendance",
    ];
    for (const p of paths) {
      const slug = guideForPath(p);
      expect(slug && helpArticle(slug)).toBeTruthy();
    }
  });
});
