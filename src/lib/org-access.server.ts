// Server-only companion to org-access.ts: loads an org's access fields and
// answers the questions that need the database (trial AI-analysis usage).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgPhase, TRIAL_AI_ANALYSIS_LIMIT, type OrgAccessInput } from "./org-access";

export type OrgAccessRow = OrgAccessInput & { id: string; extra_seats: number };

// select("*") rather than a column list on purpose: is_trial only exists once
// 20261015000000_trial_mode.sql has run, and naming a missing column would
// fail the whole query instead of just reading as "not a trial".
function toAccessRow(row: Record<string, unknown>): OrgAccessRow {
  return {
    id: row["id"] as string,
    plan: (row["plan"] as string | null) ?? null,
    active: (row["active"] as boolean | null) ?? null,
    trial_ends_at: (row["trial_ends_at"] as string | null) ?? null,
    is_trial: (row["is_trial"] as boolean | null | undefined) ?? false,
    extra_seats: (row["extra_seats"] as number | null) ?? 0,
    unlimited_seats: (row["unlimited_seats"] as boolean | null | undefined) ?? false,
  };
}

/** Active modules (org_modules) per company; empty before the table exists. */
async function activeModules(organizationId?: string): Promise<Map<string, string[]>> {
  let q = supabaseAdmin.from("org_modules").select("organization_id, module, enabled, until");
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  const out = new Map<string, string[]>();
  if (error) return out;
  const now = Date.now();
  for (const m of data ?? []) {
    if (!m.enabled || (m.until && Date.parse(m.until) <= now)) continue;
    out.set(m.organization_id, [...(out.get(m.organization_id) ?? []), m.module]);
  }
  return out;
}

export async function loadOrgAccess(organizationId: string): Promise<OrgAccessRow | null> {
  const [{ data }, mods] = await Promise.all([
    supabaseAdmin.from("organizations").select("*").eq("id", organizationId).maybeSingle(),
    activeModules(organizationId),
  ]);
  return data
    ? { ...toAccessRow(data as Record<string, unknown>), modules: mods.get(organizationId) ?? [] }
    : null;
}

export async function loadAllOrgAccess(): Promise<Map<string, OrgAccessRow>> {
  const [{ data }, mods] = await Promise.all([
    supabaseAdmin.from("organizations").select("*"),
    activeModules(),
  ]);
  return new Map(
    (data ?? []).map((row) => {
      const access = toAccessRow(row as Record<string, unknown>);
      return [access.id, { ...access, modules: mods.get(access.id) ?? [] }];
    }),
  );
}

/** Calls this org already has an AI analysis for, optionally not counting `excludeCallId`. */
export async function countAnalyzedCalls(
  organizationId: string,
  excludeCallId?: string,
): Promise<number> {
  let query = supabaseAdmin
    .from("amocrm_calls")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .not("analyzed_at", "is", null);
  if (excludeCallId) query = query.neq("id", excludeCallId);
  const { count } = await query;
  return count ?? 0;
}

/** Whether this org may run one more AI call analysis right now. */
export async function canRunAiAnalysis(
  access: OrgAccessRow,
  callId?: string,
): Promise<"ok" | "expired" | "trial_limit"> {
  const phase = orgPhase(access);
  if (phase === "expired") return "expired";
  if (phase === "trial") {
    const used = await countAnalyzedCalls(access.id, callId);
    if (used >= TRIAL_AI_ANALYSIS_LIMIT) return "trial_limit";
  }
  return "ok";
}
