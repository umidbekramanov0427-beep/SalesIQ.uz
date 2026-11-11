// Hiding a lead card row from some people or in some funnels (amoCRM's
// field rights and "show in pipelines"). A row of the lead card -- a
// built-in row, a company field ("cf:<id>"), a contact row ("c:<key>") or a
// whole group ("g:<id>") -- can be hidden:
//  - by role: from heads of sales, managers or trainees. The company's
//    super admin (and the platform owner) always see every row, so whoever
//    sets the card up never loses a field;
//  - by funnel: in the chosen funnels, for everyone -- the field just
//    doesn't belong to that kind of deal.
// Stored with the rest of the card's layout (lead_workspace_sections
// .leadCard.limits), so no schema change was needed.

export const LIMIT_ROLES = ["rop", "sotuv_menejeri", "intern"] as const;
export type LimitRole = (typeof LIMIT_ROLES)[number];

export type FieldLimit = { roles: LimitRole[]; funnels: string[] };
export type FieldLimits = Record<string, FieldLimit>;

export type FieldViewer = {
  role: string | null | undefined;
  isIntern?: boolean | undefined;
  /** The funnel of the lead being looked at. */
  funnel: string | null | undefined;
};

/** The saved limits, dropping unknown roles, blank funnels and empty entries. */
export function parseFieldLimits(raw: unknown): FieldLimits {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FieldLimits = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const roles = Array.isArray(v["roles"])
      ? [...new Set(v["roles"])].filter((r): r is LimitRole =>
          (LIMIT_ROLES as readonly unknown[]).includes(r),
        )
      : [];
    const funnels = Array.isArray(v["funnels"])
      ? [...new Set(v["funnels"])].filter(
          (f): f is string => typeof f === "string" && f.trim() !== "",
        )
      : [];
    if (roles.length || funnels.length) out[key] = { roles, funnels };
  }
  return out;
}

/** The roles a viewer counts as: a trainee is also a manager. */
function viewerRoles(viewer: FieldViewer): LimitRole[] {
  if (viewer.role === "rop") return ["rop"];
  if (viewer.role === "sotuv_menejeri")
    return viewer.isIntern ? ["sotuv_menejeri", "intern"] : ["sotuv_menejeri"];
  return [];
}

/** Whether a row's limits hide it from this viewer on this lead. */
export function isHiddenByLimit(limits: FieldLimits, key: string, viewer: FieldViewer): boolean {
  const limit = limits[key];
  if (!limit) return false;
  if (viewer.funnel && limit.funnels.includes(viewer.funnel)) return true;
  return viewerRoles(viewer).some((r) => limit.roles.includes(r));
}

/** limits with one row's limit replaced (an empty one removes the entry). */
export function withFieldLimit(limits: FieldLimits, key: string, limit: FieldLimit): FieldLimits {
  const next = { ...limits };
  if (limit.roles.length || limit.funnels.length) next[key] = limit;
  else delete next[key];
  return next;
}
