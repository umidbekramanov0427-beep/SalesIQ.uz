import { ipAllowed, ipMatches, isValidIpEntry, parseIpRules } from "@/lib/ip-allowlist";

describe("IP allowlist", () => {
  it("validates entries", () => {
    expect(isValidIpEntry("213.230.64.12")).toBe(true);
    expect(isValidIpEntry("213.230.64.0/24")).toBe(true);
    expect(isValidIpEntry("2001:db8::1")).toBe(true);
    expect(isValidIpEntry("256.1.1.1")).toBe(false);
    expect(isValidIpEntry("10.0.0.0/33")).toBe(false);
    expect(isValidIpEntry("ofis")).toBe(false);
    expect(isValidIpEntry("1.2.3.4/8/1")).toBe(false);
  });

  it("matches single addresses and networks", () => {
    expect(ipMatches("213.230.64.12", "213.230.64.12")).toBe(true);
    expect(ipMatches("213.230.64.200", "213.230.64.0/24")).toBe(true);
    expect(ipMatches("213.230.65.1", "213.230.64.0/24")).toBe(false);
    expect(ipMatches("10.20.30.40", "10.0.0.0/8")).toBe(true);
    expect(ipMatches("11.0.0.1", "10.0.0.0/8")).toBe(false);
    expect(ipMatches("::ffff:213.230.64.5", "213.230.64.0/24")).toBe(true);
    expect(ipMatches("2001:DB8::1", "2001:db8::1")).toBe(true);
    expect(ipMatches("200.1.1.1", "0.0.0.0/0")).toBe(true);
  });

  it("lets everyone in while off or empty, and keeps super admins out of it by default", () => {
    const on = parseIpRules({
      ip_allowlist_enabled: true,
      ip_allowlist: [{ value: "213.230.64.0/24", note: "Ofis" }, { value: "junk" }],
    });
    expect(on.entries).toEqual([{ value: "213.230.64.0/24", note: "Ofis" }]);
    expect(ipAllowed(on, "213.230.64.9", "sotuv_menejeri")).toBe(true);
    expect(ipAllowed(on, "95.214.10.1", "sotuv_menejeri")).toBe(false);
    expect(ipAllowed(on, null, "rop")).toBe(false);
    expect(ipAllowed(on, "95.214.10.1", "super_admin")).toBe(true);
    expect(ipAllowed({ ...on, admins: true }, "95.214.10.1", "super_admin")).toBe(false);
    expect(ipAllowed({ ...on, admins: true }, "95.214.10.1", "platform_owner")).toBe(true);
    expect(ipAllowed({ ...on, enabled: false }, "95.214.10.1", "rop")).toBe(true);
    expect(ipAllowed({ ...on, entries: [] }, "95.214.10.1", "rop")).toBe(true);
  });
});
