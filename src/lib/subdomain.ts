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
  const hostname = host.toLowerCase().split(":")[0]!;
  let label: string | null = null;
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) label = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  else if (hostname.endsWith(".localhost")) label = hostname.slice(0, -".localhost".length);
  if (!label || label.includes(".")) return null;
  return subdomainProblem(label) ? null : label;
}

/** https://<sub>.salesiq.uz, or the root domain when sub is null. */
export function companyOrigin(sub: string | null): string {
  return sub ? `https://${sub}.${ROOT_DOMAIN}` : `https://${ROOT_DOMAIN}`;
}
