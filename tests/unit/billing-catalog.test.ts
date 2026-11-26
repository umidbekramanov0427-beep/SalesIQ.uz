import {
  DEFAULT_CATALOG,
  extraSeatsFor,
  modulesGrant,
  parseCart,
  parseCatalog,
  quote,
  shortfall,
  topupCharge,
  topupCredit,
} from "@/lib/billing-catalog";

describe("billing catalog", () => {
  it("keeps defaults for missing or bad prices", () => {
    const c = parseCatalog({ crmSeat: 70000, modules: { telephony: { monthly: "abc" } } });
    expect(c.crmSeat).toBe(70000);
    expect(c.modules.telephony.monthly).toBe(DEFAULT_CATALOG.modules.telephony.monthly);
    expect(parseCatalog(null)).toEqual(DEFAULT_CATALOG);
  });

  it("reads a cart and refuses a bad one", () => {
    expect(parseCart({ seats: 12, months: 3, modules: ["telephony", "nope"] })).toEqual({
      seats: 12,
      months: 3,
      modules: ["telephony"],
    });
    expect(parseCart({ seats: 0, months: 3 })).toBe(null);
    expect(parseCart({ seats: 5, months: 2 })).toBe(null);
  });

  it("prices seats, per-seat modules, setup fees and the free months", () => {
    const c = parseCatalog({
      crmSeat: 50000,
      modules: { telephony: { monthly: 50000 }, analytics: { monthly: 500000, setup: 100000 } },
    });
    const q = quote({ seats: 12, months: 12, modules: ["telephony", "analytics"] }, c);
    expect(q.monthly).toBe(12 * 50000 + 12 * 50000 + 500000);
    expect(q.firstMonth).toBe(q.monthly + 100000);
    expect(q.total).toBe(q.firstMonth + q.monthly * 11);
    expect(q.bonusMonths).toBe(2);
    expect(q.days).toBe(14 * 30);
    expect(quote({ seats: 1, months: 3, modules: [] }, c).days).toBe(90);
  });

  it("adds the commission to a top-up and takes it off the credit", () => {
    expect(topupCharge(60843000, 1.5)).toBe(61755645);
    expect(topupCredit(61755645, 1.5)).toBe(60843000);
    expect(shortfall(1000, 400, 1.5)).toEqual({ credit: 600, charge: 609 });
    expect(shortfall(1000, 5000, 1.5)).toEqual({ credit: 0, charge: 0 });
  });

  it("maps modules to features and seats to extra seats", () => {
    expect(modulesGrant(["telephony"], "telephony")).toBe(true);
    expect(modulesGrant(["warehouse"], "telephony")).toBe(false);
    expect(modulesGrant(null, "analytics")).toBe(false);
    expect(extraSeatsFor(12, 5)).toBe(7);
    expect(extraSeatsFor(3, 5)).toBe(0);
    expect(extraSeatsFor(30, null)).toBe(0);
  });
});
