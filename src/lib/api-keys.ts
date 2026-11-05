// API kalitlari, the shared rules (browser + server, unit-tested): which
// scopes exist, what a key looks like and how a request carries it.

export const API_SCOPES = ["leads:read", "leads:write", "tasks:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Keys look like sq_live_<40 url-safe chars>. */
export const KEY_PREFIX = "sq_live_";
export const KEY_RE = /^sq_live_[A-Za-z0-9_-]{40}$/;

/** The part shown in the list so keys can be told apart: "sq_live_AbCd…". */
export const displayPrefix = (key: string) => key.slice(0, KEY_PREFIX.length + 4);

export function cleanScopes(input: unknown): ApiScope[] {
  const list = Array.isArray(input) ? input : [];
  const out = API_SCOPES.filter((s) => list.includes(s));
  return out.length ? out : ["leads:read"];
}

/** The key from "Authorization: Bearer …" or "X-Api-Key: …"; null when absent or malformed. */
export function keyFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  const raw = (bearer ?? headers.get("x-api-key") ?? "").trim();
  return KEY_RE.test(raw) ? raw : null;
}

/** A sliding one-minute window per key. */
export function makeRateLimiter(perMinute: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
