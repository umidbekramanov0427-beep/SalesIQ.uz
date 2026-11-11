import { filterMarket, isInstalled, marketCategory } from "../../src/lib/integrations-market";

const items = [
  { key: "amocrm", status: { ok: true } },
  { key: "bitrix24", status: { ok: false } },
  { key: "tel_sipuni", status: { ok: true } },
  { key: "instagram" },
  { key: "salesbots", status: { ok: true } },
];
const text = (it: { key: string }) => it.key;

describe("integrations market", () => {
  it("puts each service on its shelf and keeps bots off the store", () => {
    expect(marketCategory("amocrm")).toBe("crm");
    expect(marketCategory("tel_onlinepbx")).toBe("telephony");
    expect(marketCategory("telegramApp")).toBe("messengers");
    expect(marketCategory("apiKeys")).toBe("dev");
    expect(marketCategory("salesbots")).toBeNull();
  });

  it("counts only connected services as installed", () => {
    expect(isInstalled(items[0]!)).toBe(true);
    expect(isInstalled(items[1]!)).toBe(false);
    expect(isInstalled(items[3]!)).toBe(false);
  });

  it("filters by shelf and search together", () => {
    expect(filterMarket(items, "installed", "", text).map((i) => i.key)).toEqual([
      "amocrm",
      "tel_sipuni",
      "salesbots",
    ]);
    expect(filterMarket(items, "crm", "", text).map((i) => i.key)).toEqual(["amocrm", "bitrix24"]);
    expect(filterMarket(items, "all", "  SIP ", text).map((i) => i.key)).toEqual(["tel_sipuni"]);
    expect(filterMarket(items, "crm", "sip", text)).toEqual([]);
  });
});
