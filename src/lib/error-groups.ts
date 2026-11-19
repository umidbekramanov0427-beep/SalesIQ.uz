// Platforma -> Xatoliklar: the same error seen many times is one row. Two
// errors are "the same" when their kind, their message with the changing
// parts (ids, numbers, quoted values) masked, and their page (ids masked)
// match. Each group keeps how often it happened, in how many companies,
// when first and last, and how many are still open.

export type ErrorKind = "server_error" | "slow_request" | "client";

export type ErrorRow = {
  id: string;
  created_at: string;
  message: string;
  source: string;
  route: string | null;
  organization_id: string | null;
  resolved: boolean;
  context?: unknown;
};

export type ErrorGroup = {
  key: string;
  kind: ErrorKind;
  message: string;
  route: string | null;
  count: number;
  open: number;
  orgs: string[];
  first: string;
  last: string;
  /** Newest first. */
  items: ErrorRow[];
};

export function kindOf(source: string): ErrorKind {
  return source === "server_error" || source === "slow_request" ? source : "client";
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The message with what changes from one occurrence to the next masked. */
export function maskMessage(message: string): string {
  return message
    .replace(UUID_RE, "<id>")
    .replace(/"[^"]{1,200}"|'[^']{1,200}'/g, "<v>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** A page path with its ids masked: /platform/organizations/<id>. */
export function maskRoute(route: string | null): string | null {
  if (!route) return null;
  return route
    .split("?")[0]!
    .replace(UUID_RE, "<id>")
    .replace(/\/\d+(?=\/|$)/g, "/<n>");
}

export function groupErrors(rows: ErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const r of rows) {
    const kind = kindOf(r.source);
    const route = maskRoute(r.route);
    const key = `${kind}|${maskMessage(r.message)}|${route ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        kind,
        message: r.message,
        route,
        count: 0,
        open: 0,
        orgs: [],
        first: r.created_at,
        last: r.created_at,
        items: [],
      };
      groups.set(key, g);
    }
    g.count++;
    if (!r.resolved) g.open++;
    if (r.organization_id && !g.orgs.includes(r.organization_id)) g.orgs.push(r.organization_id);
    if (r.created_at < g.first) g.first = r.created_at;
    if (r.created_at > g.last) {
      g.last = r.created_at;
      g.message = r.message;
    }
    g.items.push(r);
  }
  const out = [...groups.values()];
  for (const g of out) g.items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  // Open ones first, then the most recent.
  return out.sort(
    (a, b) => Number(b.open > 0) - Number(a.open > 0) || b.last.localeCompare(a.last),
  );
}
