// Server-only. The OAuth `state` amoCRM echoes back to our callback: the org
// it's for, when it was issued and an HMAC over both. The callback is a
// public URL, so without the signature anyone could send amoCRM's code to it
// with another company's id in `state` and attach their own amoCRM account
// to that company. Signed with the service-role key (never leaves the
// server); valid for 30 minutes.
import crypto from "node:crypto";

const MAX_AGE_MS = 30 * 60_000;

function key(): string {
  const k = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return k;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", key()).update(`amocrm-oauth:${payload}`).digest("hex");
}

export function makeAmoOAuthState(organizationId: string): string {
  const payload = `${organizationId}.${Date.now().toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

/** The organization id when the state is genuine and fresh, else null. */
export function readAmoOAuthState(state: string | null): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [org, issued, mac] = parts as [string, string, string];
  const expected = sign(`${org}.${issued}`);
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  const at = parseInt(issued, 36);
  if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) return null;
  return org;
}
