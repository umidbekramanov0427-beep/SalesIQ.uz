import { cleanScopes, displayPrefix, keyFromHeaders, makeRateLimiter } from "@/lib/api-keys";

const KEY = "sq_live_" + "a".repeat(40);

describe("API keys", () => {
  it("reads a key from Bearer or X-Api-Key, and nothing malformed", () => {
    expect(keyFromHeaders(new Headers({ authorization: `Bearer ${KEY}` }))).toBe(KEY);
    expect(keyFromHeaders(new Headers({ "x-api-key": KEY }))).toBe(KEY);
    expect(keyFromHeaders(new Headers({ authorization: "Bearer sq_live_short" }))).toBeNull();
    expect(keyFromHeaders(new Headers({ authorization: `Basic ${KEY}` }))).toBeNull();
    expect(keyFromHeaders(new Headers())).toBeNull();
  });

  it("keeps only known scopes and never leaves a key without one", () => {
    expect(cleanScopes(["leads:write", "admin:all", "tasks:write"])).toEqual([
      "leads:write",
      "tasks:write",
    ]);
    expect(cleanScopes([])).toEqual(["leads:read"]);
    expect(cleanScopes("leads:write")).toEqual(["leads:read"]);
  });

  it("shows only the key's first characters", () => {
    expect(displayPrefix(KEY)).toBe("sq_live_aaaa");
  });

  it("allows N requests a minute per key, then refuses until the window moves", () => {
    const allow = makeRateLimiter(3);
    const t0 = 1_000_000;
    expect([0, 1, 2, 3].map((i) => allow("k", t0 + i))).toEqual([true, true, true, false]);
    expect(allow("other", t0)).toBe(true);
    expect(allow("k", t0 + 60_001)).toBe(true);
  });
});
