import {
  EMPTY_UI,
  cardState,
  figureOf,
  pageKey,
  parseUiSettings,
  slug,
  tableSignature,
  withCardRule,
  withPageRule,
} from "@/lib/ui-settings";

describe("parseUiSettings", () => {
  it("keeps good rules and drops the rest", () => {
    const s = parseUiSettings({
      cards: { "/|a": { hide: true, min: 5, max: "x" }, "/|b": { min: null }, "/|c": 3 },
      pages: {
        "/refunds": { refresh: 60, filters: "?tab=x", columns: { t: ["a", 3, "b"], e: [] } },
        "/bad": { refresh: 7 },
        nope: { refresh: 60 },
      },
      junk: 1,
    });
    expect(s.cards).toEqual({ "/|a": { hide: true, min: 5 } });
    expect(s.pages).toEqual({
      "/refunds": { refresh: 60, filters: "tab=x", columns: { t: ["a", "b"] } },
    });
    expect(parseUiSettings({ home: { "kpi.leads": { target: 5 }, x: 1, e: {} } }).home).toEqual({
      "kpi.leads": { target: 5 },
    });
    expect(parseUiSettings(null)).toEqual(EMPTY_UI);
    expect(parseUiSettings([1])).toEqual(EMPTY_UI);
  });
});

describe("withCardRule / withPageRule", () => {
  it("sets and removes rules", () => {
    let s = withCardRule(EMPTY_UI, "/|a", { min: 10, max: null });
    expect(s.cards["/|a"]).toEqual({ min: 10 });
    s = withCardRule(s, "/|a", {});
    expect(s.cards).toEqual({});
    let p = withPageRule(EMPTY_UI, "/x", { refresh: 30, filters: "a=1" });
    p = withPageRule(p, "/x", { refresh: 0 });
    expect(p.pages["/x"]).toEqual({ filters: "a=1" });
    p = withPageRule(p, "/x", { filters: "" });
    expect(p.pages).toEqual({});
  });
});

describe("pageKey", () => {
  it("folds ids", () => {
    expect(pageKey("/platform/organizations/0b6c2f2e-1111-2222-3333-444444444444")).toBe(
      "/platform/organizations/:id",
    );
    expect(pageKey("/leads/123/")).toBe("/leads/:id");
    expect(pageKey("/")).toBe("/");
    expect(pageKey("/refunds?x=1")).toBe("/refunds");
  });
});

describe("figureOf / cardState", () => {
  it("reads the figure on a card", () => {
    expect(figureOf("15 000 000 so'm")).toBe(15000000);
    expect(figureOf("43%")).toBe(43);
    expect(figureOf("72/100")).toBe(72);
    expect(figureOf("−12,5")).toBe(-12.5);
    expect(figureOf("+1233.3%")).toBe(1233.3);
    expect(figureOf("—")).toBeNull();
    expect(figureOf(7)).toBe(7);
  });

  it("is red past a limit and green within", () => {
    expect(cardState({ min: 20 }, "15%")).toBe("bad");
    expect(cardState({ min: 20 }, "25%")).toBe("good");
    expect(cardState({ max: 100000 }, "120 000 so'm")).toBe("bad");
    expect(cardState({ hide: true }, "5")).toBeNull();
    expect(cardState({ min: 1 }, "—")).toBeNull();
    expect(cardState(undefined, "5")).toBeNull();
  });
});

describe("slug / tableSignature", () => {
  it("makes stable keys", () => {
    expect(slug("Yangi lidlar (bugun)")).toBe("yangi-lidlar-bugun");
    expect(slug("Лиды")).toBe("лиды");
    expect(tableSignature(["#", "Mijoz", "Summa"])).toBe("mijoz-summa");
    expect(tableSignature([])).toBe("table");
  });
});
