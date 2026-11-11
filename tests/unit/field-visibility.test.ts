import { isHiddenByLimit, parseFieldLimits, withFieldLimit } from "@/lib/field-visibility";

describe("field visibility limits", () => {
  const limits = parseFieldLimits({
    "cf:salary": { roles: ["sotuv_menejeri"], funnels: [] },
    budget: { roles: ["intern"], funnels: ["Ulgurji"] },
    "c:email": { roles: ["boss", ""], funnels: ["", 3] },
    junk: "x",
  });

  it("drops unknown roles, blank funnels and empty entries", () => {
    expect(Object.keys(limits).sort()).toEqual(["budget", "cf:salary"]);
    expect(parseFieldLimits(null)).toEqual({});
    expect(parseFieldLimits([1])).toEqual({});
  });

  it("hides by role; super admins always see the row", () => {
    const rep = { role: "sotuv_menejeri", funnel: "Asosiy" };
    expect(isHiddenByLimit(limits, "cf:salary", rep)).toBe(true);
    expect(isHiddenByLimit(limits, "cf:salary", { role: "rop", funnel: "Asosiy" })).toBe(false);
    expect(isHiddenByLimit(limits, "cf:salary", { role: "super_admin", funnel: "Asosiy" })).toBe(
      false,
    );
  });

  it("treats a trainee as a manager too", () => {
    const intern = { role: "sotuv_menejeri", isIntern: true, funnel: "Asosiy" };
    expect(isHiddenByLimit(limits, "cf:salary", intern)).toBe(true);
    expect(isHiddenByLimit(limits, "budget", intern)).toBe(true);
    expect(isHiddenByLimit(limits, "budget", { role: "sotuv_menejeri", funnel: "Asosiy" })).toBe(
      false,
    );
  });

  it("hides in the chosen funnels for everyone", () => {
    expect(isHiddenByLimit(limits, "budget", { role: "super_admin", funnel: "Ulgurji" })).toBe(
      true,
    );
    expect(isHiddenByLimit(limits, "budget", { role: "super_admin", funnel: null })).toBe(false);
    expect(isHiddenByLimit(limits, "phone", { role: "sotuv_menejeri", funnel: "Ulgurji" })).toBe(
      false,
    );
  });

  it("removes a row's entry when its limit is emptied", () => {
    const next = withFieldLimit(limits, "budget", { roles: [], funnels: [] });
    expect(next["budget"]).toBeUndefined();
    expect(next["cf:salary"]).toBeDefined();
    expect(withFieldLimit({}, "x", { roles: ["rop"], funnels: [] })).toEqual({
      x: { roles: ["rop"], funnels: [] },
    });
  });
});
