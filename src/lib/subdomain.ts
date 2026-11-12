// Per-company subdomains (<subdomain>.salesiq.uz). Shared by the browser
// (which company's login page am I on?) and the server (validating a new
// subdomain). Pure functions only.

export const ROOT_DOMAIN = (
  (import.meta.env?.["VITE_ROOT_DOMAIN"] as string | undefined) ?? "salesiq.uz"
).toLowerCase();

// Labels that must never belong to a company: the marketing site, the app
// itself, mail/DNS infrastructure and anything that could pass for us.
const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "platform",
  "mail",
  "smtp",
  "imap",
  "pop",
  "ftp",
  "ns1",
  "ns2",
  "cdn",
  "static",
  "assets",
  "files",
  "status",
  "help",
  "support",
  "docs",
  "blog",
  "billing",
  "pay",
  "auth",
  "login",
  "signup",
  "dev",
  "staging",
  "test",
  "demo",
  "salesiq",
  "salesos",
  "worker",
  "vps",
  "marketing",
  "mkt",
]);

const FORMAT = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

/** Lowercases and strips everything a subdomain can't contain. */
export function normalizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\.salesiq\.uz$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type SubdomainProblem = "format" | "reserved";

export function subdomainProblem(value: string): SubdomainProblem | null {
  if (!FORMAT.test(value)) return "format";
  if (RESERVED.has(value)) return "reserved";
  return null;
}

/**
 * The company subdomain in a Host header / location.host, or null on the
 * root domain, www, a reserved label, a preview URL or localhost. Local
 * development can use "<sub>.localhost".
 */
export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  // <sub>.marketing.salesiq.uz is the same company's marketing panel.
  const hostname = host
    .toLowerCase()
    .split(":")[0]!
    .replace(new RegExp(`\\.${MARKETING_LABEL}\\.(${escapeDots(ROOT_DOMAIN)}|localhost)$`), ".$1");
  let label: string | null = null;
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) label = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  else if (hostname.endsWith(".localhost")) label = hostname.slice(0, -".localhost".length);
  if (!label || label.includes(".")) return null;
  return subdomainProblem(label) ? null : label;
}

/**
 * The two panels on one database: the sales CRM (salesiq.uz,
 * <sub>.salesiq.uz) and the marketing panel (marketing.salesiq.uz,
 * <sub>.marketing.salesiq.uz).
 */
export type Panel = "crm" | "marketing";
export const MARKETING_LABEL = "marketing";

function escapeDots(s: string): string {
  return s.replace(/\./g, "\\.");
}

/** Which panel an address serves ("marketing.localhost" works locally). */
export function panelFromHost(host: string | null | undefined): Panel {
  if (!host) return "crm";
  const hostname = host.toLowerCase().split(":")[0]!;
  const roots = [ROOT_DOMAIN, "localhost"].map((r) => `${MARKETING_LABEL}.${r}`);
  return roots.some((r) => hostname === r || hostname.endsWith(`.${r}`)) ? "marketing" : "crm";
}

/** Whether an address is the platform's own (not a preview URL): only there do panels move. */
export function isPlatformHost(host: string | null | undefined): boolean {
  const hostname = (host ?? "").toLowerCase().split(":")[0]!;
  return hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
}

/** https://<sub>.salesiq.uz, or the root domain when sub is null; the marketing panel's with panel. */
export function companyOrigin(sub: string | null, panel: Panel = "crm"): string {
  const base = panel === "marketing" ? `${MARKETING_LABEL}.${ROOT_DOMAIN}` : ROOT_DOMAIN;
  return sub ? `https://${sub}.${base}` : `https://${base}`;
}
