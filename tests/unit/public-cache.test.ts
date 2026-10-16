import { PUBLIC_CDN_CACHE, publicCdnCache } from "@/lib/public-cache";

const ok = {
  method: "GET",
  path: "/",
  status: 200,
  hasAuthorization: false,
  setsCookie: false,
  contentType: "text/html; charset=utf-8",
};

describe("publicCdnCache", () => {
  it("caches the public pages and the pricing API", () => {
    expect(publicCdnCache(ok)).toBe(PUBLIC_CDN_CACHE);
    expect(publicCdnCache({ ...ok, path: "/pricing" })).toBe(PUBLIC_CDN_CACHE);
    expect(publicCdnCache({ ...ok, path: "/api/pricing", contentType: "application/json" })).toBe(
      PUBLIC_CDN_CACHE,
    );
  });

  it("never caches app pages, errors, signed-in calls or cookies", () => {
    expect(publicCdnCache({ ...ok, path: "/funnels" })).toBeNull();
    expect(publicCdnCache({ ...ok, path: "/pay/abc" })).toBeNull();
    expect(publicCdnCache({ ...ok, status: 500 })).toBeNull();
    expect(publicCdnCache({ ...ok, status: 302 })).toBeNull();
    expect(publicCdnCache({ ...ok, hasAuthorization: true })).toBeNull();
    expect(publicCdnCache({ ...ok, setsCookie: true })).toBeNull();
    expect(publicCdnCache({ ...ok, method: "POST" })).toBeNull();
  });
});
