import {
  canOpenSection,
  funnelOpen,
  leadScopeFor,
  ownersForScope,
  parseAccessRules,
} from "@/lib/access-rules";

const profiles = [
  { id: "rop1", manager_id: null },
  { id: "rep1", manager_id: "rop1" },
  { id: "rep2", manager_id: "rop1" },
  { id: "rop2", manager_id: null },
  { id: "rep3", manager_id: "rop2" },
];

describe("access rules", () => {
  it("parses only known roles, scopes and boolean flags", () => {
    const r = parseAccessRules({
      rop: { leads: "all", sections: { inbox: false, x: "no" }, funnels: { A: false } },
      sotuv_menejeri: { leads: "everything" },
      super_admin: { leads: "own" },
    });
    expect(r).toEqual({
      rop: { leads: "all", sections: { inbox: false }, funnels: { A: false } },
      sotuv_menejeri: {},
    });
    expect(parseAccessRules(null)).toEqual({});
  });

  it("defaults: a ROP sees the group, a manager (and intern) their own, a super admin everything", () => {
    expect(leadScopeFor({}, "rop")).toBe("group");
    expect(leadScopeFor({}, "sotuv_menejeri")).toBe("own");
    expect(leadScopeFor({}, "intern")).toBe("own");
    expect(leadScopeFor({}, "super_admin")).toBeNull();
    expect(leadScopeFor({ rop: { leads: "all" } }, "rop")).toBe("all");
  });

  it("works out whose leads each scope covers", () => {
    const me = (id: string, managerId: string | null) => ({ id, managerId });
    expect(ownersForScope("all", me("rep1", "rop1"), "sotuv_menejeri", profiles)).toBeNull();
    expect([...ownersForScope("own", me("rep1", "rop1"), "sotuv_menejeri", profiles)!]).toEqual([
      "rep1",
    ]);
    expect([...ownersForScope("group", me("rop1", null), "rop", profiles)!].sort()).toEqual([
      "rep1",
      "rep2",
      "rop1",
    ]);
    // A manager's group: them, their teammates and their ROP -- not another team.
    expect(
      [...ownersForScope("group", me("rep1", "rop1"), "sotuv_menejeri", profiles)!].sort(),
    ).toEqual(["rep1", "rep2", "rop1"]);
  });

  it("closes sections and funnels only for the role they were closed for", () => {
    const rules = parseAccessRules({
      sotuv_menejeri: { sections: { inbox: false }, funnels: { "Kurs savdosi": false } },
    });
    expect(canOpenSection(rules, "sotuv_menejeri", "/inbox")).toBe(false);
    expect(canOpenSection(rules, "intern", "/inbox/123")).toBe(false);
    expect(canOpenSection(rules, "rop", "/inbox")).toBe(true);
    expect(canOpenSection(rules, "super_admin", "/inbox")).toBe(true);
    expect(canOpenSection(rules, "sotuv_menejeri", "/settings")).toBe(true);
    expect(funnelOpen(rules, "sotuv_menejeri", "Kurs savdosi")).toBe(false);
    expect(funnelOpen(rules, "sotuv_menejeri", "Boshqa")).toBe(true);
    expect(funnelOpen(rules, "super_admin", "Kurs savdosi")).toBe(true);
  });
});
