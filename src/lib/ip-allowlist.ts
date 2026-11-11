// IP oq ro'yxati (Admin -> Xavfsizlik markazi): a company can let its people
// sign in only from listed addresses -- one IP ("213.230.64.12") or a
// network ("213.230.64.0/24", IPv4; IPv6 addresses exactly). Checked on the
// server at every sign-in and page load (/account/ip-check); a session from
// elsewhere is closed. Super admins are left out unless the company says
// otherwise, so the person setting it up can't lock the company out.

export type IpEntry = { value: string; note: string };

export type IpRules = {
  enabled: boolean;
  entries: IpEntry[];
  /** Apply to super admins too (off by default). */
  admins: boolean;
};

export const DEFAULT_IP_RULES: IpRules = { enabled: false, entries: [], admins: false };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** "::ffff:1.2.3.4" (IPv4 seen through IPv6) as plain IPv4. */
function plainIp(ip: string): string {
  const v = ip.trim().toLowerCase();
  return v.startsWith("::ffff:") && v.includes(".") ? v.slice(7) : v;
}

/** Whether one entry is a valid IP or IPv4 network. */
export function isValidIpEntry(value: string): boolean {
  const v = value.trim();
  const [addr, bits, extra] = v.split("/");
  if (extra !== undefined || !addr) return false;
  if (addr.includes(":"))
    return bits === undefined && /^[0-9a-f:]+$/i.test(addr) && addr.length <= 39;
  if (ipv4ToInt(addr) === null) return false;
  if (bits === undefined) return true;
  return /^\d{1,2}$/.test(bits) && Number(bits) <= 32;
}

/** Whether an address matches one entry. */
export function ipMatches(ip: string, entry: string): boolean {
  const addr = plainIp(ip);
  const [net, bitsRaw] = entry.trim().split("/");
  if (!net) return false;
  if (net.includes(":") || addr.includes(":")) return plainIp(net) === addr;
  const a = ipv4ToInt(addr);
  const b = ipv4ToInt(net);
  if (a === null || b === null) return false;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  // Same network = same address once the host bits are divided away
  // (JS bit operators are 32-bit signed, so no masks).
  const hosts = 2 ** (32 - bits);
  return Math.floor(a / hosts) === Math.floor(b / hosts);
}

/** The saved rules, dropping invalid entries. */
export function parseIpRules(
  raw:
    | {
        ip_allowlist_enabled?: unknown;
        ip_allowlist?: unknown;
        ip_allowlist_admins?: unknown;
      }
    | null
    | undefined,
): IpRules {
  if (!raw) return DEFAULT_IP_RULES;
  const list = Array.isArray(raw.ip_allowlist) ? raw.ip_allowlist : [];
  const entries: IpEntry[] = [];
  for (const e of list) {
    const value =
      typeof e === "string"
        ? e
        : e && typeof e === "object"
          ? (e as { value?: unknown }).value
          : null;
    const note = e && typeof e === "object" ? (e as { note?: unknown }).note : "";
    if (typeof value === "string" && isValidIpEntry(value)) {
      entries.push({
        value: value.trim(),
        note: typeof note === "string" ? note.slice(0, 60) : "",
      });
    }
  }
  return {
    enabled: raw.ip_allowlist_enabled === true,
    entries,
    admins: raw.ip_allowlist_admins === true,
  };
}

/**
 * Whether a person may be signed in from this address. Off, or an empty
 * list, lets everyone in; the platform owner always; super admins unless
 * the rules include them. An unknown address is refused only when the
 * list is on.
 */
export function ipAllowed(
  rules: IpRules,
  ip: string | null,
  role: string | null | undefined,
): boolean {
  if (!rules.enabled || rules.entries.length === 0) return true;
  if (role === "platform_owner") return true;
  if (role === "super_admin" && !rules.admins) return true;
  if (!ip) return false;
  return rules.entries.some((e) => ipMatches(ip, e.value));
}
