// Who and where a request comes from: browser and OS from the user agent,
// IP from the proxy's X-Forwarded-For (Caddy sets it). Used by the sign-in
// records behind the visits report.

export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Yandex"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows NT 10/.test(ua)
          ? "Windows 10/11"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser}, ${os}` : browser;
}

export function header(request: Request, name: string): string | null {
  const v = request.headers.get(name);
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * City, country and region of the request. The server has no IP
 * geolocation yet, so these stay empty (and the "new country/city" sign-in
 * alert stays quiet) until one is added here.
 */
export function requestGeo(_request: Request): {
  city: string | null;
  country: string | null;
  region: string | null;
} {
  return { city: null, country: null, region: null };
}

export function requestIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

/**
 * The Supabase auth session behind the request's (already verified) bearer
 * token -- its `session_id` claim -- so the platform owner can close that
 * one session later. Null when there is no token or claim.
 */
export function authSessionId(request: Request): string | null {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof json.session_id === "string" && /^[0-9a-f-]{36}$/i.test(json.session_id)
      ? json.session_id
      : null;
  } catch {
    return null;
  }
}
