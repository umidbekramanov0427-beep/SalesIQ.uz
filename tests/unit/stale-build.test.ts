import { parseLastReload, shouldReloadFor, staleReloadTarget } from "@/lib/stale-build";

describe("stale build recovery", () => {
  it("goes where the person was heading, not back to the page they left", () => {
    expect(staleReloadTarget("/funnels?funnel=A", "/")).toBe("/funnels?funnel=A");
    expect(staleReloadTarget(null, "/inbox")).toBe("/inbox");
    expect(staleReloadTarget("https://evil.example/x", "/")).toBe("/");
  });

  it("reloads again for another section, but not in a loop for the same one", () => {
    const now = 1_000_000;
    expect(shouldReloadFor("/funnels", null, now)).toBe(true);
    expect(shouldReloadFor("/funnels", { target: "/", at: now - 1000 }, now)).toBe(true);
    expect(shouldReloadFor("/funnels", { target: "/funnels", at: now - 5000 }, now)).toBe(false);
    expect(shouldReloadFor("/funnels", { target: "/funnels", at: now - 30_000 }, now)).toBe(true);
  });

  it("reads what was stored, ignoring junk", () => {
    expect(parseLastReload('{"target":"/x","at":5}')).toEqual({ target: "/x", at: 5 });
    expect(parseLastReload("123")).toBeNull();
    expect(parseLastReload("{")).toBeNull();
    expect(parseLastReload(null)).toBeNull();
  });
});
