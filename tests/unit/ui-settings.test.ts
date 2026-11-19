import { parseUiSettings } from "@/lib/ui-settings";

describe("parseUiSettings", () => {
  it("cleans notify and phone and keeps every other stored key", () => {
    const s = parseUiSettings({
      cards: { "/|x": { hide: true } },
      notify: { newClient: true, keywords: ["narx"] },
      phone: "bad",
    });
    expect(s["cards"]).toEqual({ "/|x": { hide: true } });
    expect(s.notify).toBeDefined();
    expect(s.phone).toBeUndefined();
  });

  it("is empty for anything that isn't an object", () => {
    expect(parseUiSettings(null)).toEqual({});
    expect(parseUiSettings([1, 2])).toEqual({});
  });
});
