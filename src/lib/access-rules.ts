// Sozlamalar → Huquqlar, the amoCRM-style access a company's super admin
// sets per role (org_access_rules.rules): which sections and funnels the
// ROPs and managers open, and whose leads they see. Pure, so the rules are
// unit-tested; hooks/crm/access.ts reads and saves them.

/** A session role or a nav role; an intern follows the managers' rules. */
type Role = string | null | undefined;

export type LeadScope = "all" | "group" | "own";
export const LEAD_SCOPES: LeadScope[] = ["all", "group", "own"];

/** The roles the rules apply to; a super admin always has everything. */
export const MANAGED_ROLES = ["rop", "sotuv_menejeri"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export type RoleRules = {
  leads?: LeadScope;
  /** false closes the section; missing = open. */
  sections?: Record<string, boolean>;
  /** false hides the funnel; missing = open. */
  funnels?: Record<string, boolean>;
};
export type AccessRules = Partial<Record<ManagedRole, RoleRules>>;

/** Sections a role can be kept out of, by the page they live on. */
export const ACCESS_SECTIONS = [
  { key: "funnels", path: "/funnels" },
  { key: "inbox", path: "/inbox" },
  { key: "audio", path: "/audio-analytics" },
  { key: "leadAnalytics", path: "/lead-analytics" },
  { key: "analytics", path: "/analytics" },
  { key: "attendance", path: "/attendance" },
  { key: "classroom", path: "/content-library" },
  { key: "ai", path: "/ai-assistant" },
] as const;
export type SectionKey = (typeof ACCESS_SECTIONS)[number]["key"];

/** The rules row a role follows, or null for a role the rules never limit. */
export function managedRoleOf(role: Role): ManagedRole | null {
  if (role === "rop") return "rop";
  if (role === "sotuv_menejeri" || role === "intern") return "sotuv_menejeri";
  return null;
}

/** Whatever the database holds, as rules: unknown keys and values dropped. */
export function parseAccessRules(raw: unknown): AccessRules {
  const out: AccessRules = {};
  if (!raw || typeof raw !== "object") return out;
  for (const role of MANAGED_ROLES) {
    const r = (raw as Record<string, unknown>)[role];
    if (!r || typeof r !== "object") continue;
    const src = r as Record<string, unknown>;
    const rr: RoleRules = {};
    if (LEAD_SCOPES.includes(src["leads"] as LeadScope)) rr.leads = src["leads"] as LeadScope;
    for (const k of ["sections", "funnels"] as const) {
      const m = src[k];
      if (!m || typeof m !== "object") continue;
      const flags: Record<string, boolean> = {};
      for (const [name, v] of Object.entries(m)) if (typeof v === "boolean") flags[name] = v;
      rr[k] = flags;
    }
    out[role] = rr;
  }
  return out;
}

/** The default before anyone changes it: a ROP sees their team, a manager their own leads. */
export function defaultLeadScope(role: ManagedRole): LeadScope {
  return role === "rop" ? "group" : "own";
}

/** null: no limit (a super admin, the platform owner). */
export function leadScopeFor(rules: AccessRules, role: Role): LeadScope | null {
  const m = managedRoleOf(role);
  if (!m) return null;
  return rules[m]?.leads ?? defaultLeadScope(m);
}

export function sectionForPath(pathname: string): SectionKey | null {
  const hit = ACCESS_SECTIONS.find((s) => pathname === s.path || pathname.startsWith(s.path + "/"));
  return hit?.key ?? null;
}

export function sectionOpen(rules: AccessRules, role: Role, key: SectionKey): boolean {
  const m = managedRoleOf(role);
  return !m || rules[m]?.sections?.[key] !== false;
}

/** False when the rules close the section this page belongs to. */
export function canOpenSection(rules: AccessRules, role: Role, pathname: string): boolean {
  const key = sectionForPath(pathname);
  return !key || sectionOpen(rules, role, key);
}

export function funnelOpen(rules: AccessRules, role: Role, funnel: string): boolean {
  const m = managedRoleOf(role);
  return !m || rules[m]?.funnels?.[funnel] !== false;
}

/**
 * Whose leads a person sees, from their scope: null = everyone's.
 * "group" for a ROP is them and the people they lead; for a manager it is
 * them, their teammates (same ROP) and that ROP.
 */
export function ownersForScope(
  scope: LeadScope | null,
  me: { id: string; managerId: string | null },
  role: Role,
  profiles: { id: string; manager_id: string | null }[],
): Set<string> | null {
  if (scope === null || scope === "all") return null;
  const ids = new Set<string>([me.id]);
  if (scope === "own") return ids;
  if (role === "rop") {
    for (const p of profiles) if (p.manager_id === me.id) ids.add(p.id);
    return ids;
  }
  if (me.managerId) {
    ids.add(me.managerId);
    for (const p of profiles) if (p.manager_id === me.managerId) ids.add(p.id);
  }
  return ids;
}
