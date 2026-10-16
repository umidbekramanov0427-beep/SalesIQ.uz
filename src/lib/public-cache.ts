// Edge caching for the public pages (landing, pricing, sign-in pages and
// the pricing API): their HTML is the same for every visitor (sign-in is
// handled in the browser), so Vercel's CDN may keep a copy for a minute
// and serve a stale one while it refreshes -- the slow first render (p99)
// then only hits one visitor a minute per address. Only Vercel's cache
// gets the header; browsers still revalidate. A new deployment starts
// with an empty cache. Pure, so the rule is unit-tested; src/server.ts
// applies it.

const PUBLIC_PATHS = new Set(["/", "/pricing", "/login", "/signup", "/api/pricing"]);

export const PUBLIC_CDN_CACHE = "max-age=60, stale-while-revalidate=600";

export function publicCdnCache(input: {
  method: string;
  path: string;
  status: number;
  hasAuthorization: boolean;
  setsCookie: boolean;
  contentType: string;
}): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (input.status !== 200 || input.hasAuthorization || input.setsCookie) return null;
  if (!PUBLIC_PATHS.has(input.path)) return null;
  if (!/text\/html|application\/json/.test(input.contentType)) return null;
  return PUBLIC_CDN_CACHE;
}
