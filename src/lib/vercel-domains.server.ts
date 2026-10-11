// Server-only. Company subdomains (<sub>.salesiq.uz) on Vercel.
//
// DNS for salesiq.uz stays at the registrar (webspace.uz) with one wildcard
// record, `* CNAME cname.vercel-dns.com`, so every subdomain already reaches
// Vercel. Vercel only serves (and issues an HTTPS certificate for) a host
// that is attached to the project, and a wildcard can't be attached while
// DNS is external -- so each company's subdomain is attached on its own,
// through the API, when the company picks it. The certificate then comes
// by itself over HTTP.
//
// Needs VERCEL_API_TOKEN (a token with access to the team), VERCEL_PROJECT_ID
// and VERCEL_TEAM_ID. Without them nothing is attached and the status reads
// "unconfigured", so saving a subdomain still works.

const API = "https://api.vercel.com";

type Config = { token: string; projectId: string; teamId: string };

function config(): Config | null {
  const token = process.env["VERCEL_API_TOKEN"];
  const projectId = process.env["VERCEL_PROJECT_ID"];
  const teamId = process.env["VERCEL_TEAM_ID"];
  return token && projectId && teamId ? { token, projectId, teamId } : null;
}

async function call(cfg: Config, method: string, path: string, body?: unknown): Promise<Response> {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(cfg.teamId)}`;
  return fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
}

/**
 * - active: attached, verified and DNS points at Vercel -- it opens.
 * - pending: attached, waiting for DNS or the certificate.
 * - missing: not attached to the project.
 * - unconfigured: no API token, nothing can be checked or attached.
 * - error: the API refused or didn't answer.
 */
export type DomainStatus = "active" | "pending" | "missing" | "unconfigured" | "error";

const projectDomain = (cfg: Config, host: string) =>
  `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(host)}`;

export async function domainStatus(host: string): Promise<DomainStatus> {
  const cfg = config();
  if (!cfg) return "unconfigured";
  try {
    const res = await call(cfg, "GET", projectDomain(cfg, host));
    if (res.status === 404) return "missing";
    if (!res.ok) return "error";
    const domain = (await res.json()) as { verified?: boolean };
    if (!domain.verified) return "pending";
    const conf = await call(cfg, "GET", `/v6/domains/${encodeURIComponent(host)}/config`);
    if (!conf.ok) return "pending";
    const { misconfigured } = (await conf.json()) as { misconfigured?: boolean };
    return misconfigured ? "pending" : "active";
  } catch {
    return "error";
  }
}

/** Attaches the host to the project (no-op if it already is). */
export async function attachDomain(host: string): Promise<DomainStatus> {
  const cfg = config();
  if (!cfg) return "unconfigured";
  try {
    const res = await call(
      cfg,
      "POST",
      `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`,
      { name: host },
    );
    // Already on this project counts as done; anything else is reported.
    if (!res.ok && (await domainStatus(host)) === "missing") return "error";
  } catch {
    return "error";
  }
  return domainStatus(host);
}

/** Detaches the host from the project (no-op if it isn't attached). */
export async function detachDomain(host: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  await call(cfg, "DELETE", projectDomain(cfg, host)).catch(() => undefined);
}
