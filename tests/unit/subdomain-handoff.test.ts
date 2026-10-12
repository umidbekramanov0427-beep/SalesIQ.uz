import { safeHandoffNext } from "@/lib/subdomain-handoff";

// After moving to a company's own address, only a page of that same
// address may be opened -- never another site.
describe("safeHandoffNext", () => {
  it("keeps a page path with its query", () => {
    expect(safeHandoffNext("/leads?stage=new")).toBe("/leads?stage=new");
  });

  it("falls back to home for a missing or foreign target", () => {
    expect(safeHandoffNext(null)).toBe("/");
    expect(safeHandoffNext("")).toBe("/");
    expect(safeHandoffNext("https://evil.example")).toBe("/");
    expect(safeHandoffNext("//evil.example")).toBe("/");
    expect(safeHandoffNext("/\\evil.example")).toBe("/");
  });

  it("never loops back to the handoff page", () => {
    expect(safeHandoffNext("/auth/handoff")).toBe("/");
    expect(safeHandoffNext("/auth/handoff?x=1")).toBe("/");
  });
});
