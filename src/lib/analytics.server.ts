import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  salesAnalysis,
  summaryByOwner,
  winLoss,
  type ActivityEvent,
  type AnalyticsData,
  type ActivityKind,
  type ALead,
  type AStage,
  type AStageEvent,
  type Range,
} from "@/lib/analytics-reports";

export { parseRange } from "@/lib/analytics-reports";
import {
  funnelOpen,
  leadScopeFor,
  ownersForScope,
  parseAccessRules,
  type LeadScope,
} from "@/lib/access-rules";

// Analitika's data: gathered with the service role, always pinned to the
// caller's company, and cut to whose leads the caller may see (Huquqlar:
// a manager their own, a ROP their team, a super admin everyone). The
// reports themselves are computed by lib/analytics-reports.ts.

/** Tashkent: the company's day starts at 00:00 +05:00. */
export const TZ_OFFSET_MIN = 300;
const MAX_ROWS = 20_000;
const PAGE = 1000;

// Reads every page of a query (Supabase returns at most 1000 rows a call),
// up to MAX_ROWS; `truncated` says the cap was hit.
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_ROWS; i += PAGE) {
    const { data, error } = await page(i, i + PAGE - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: rows.length >= MAX_ROWS };
}

export type Viewer = {
  orgId: string;
  meId: string;
  role: string | null;
  scope: LeadScope | null;
  /** null: everyone's leads. */
  owners: Set<string> | null;
  people: { id: string; name: string; role: string | null }[];
  canSeeFunnel: (funnel: string) => boolean;
};

export async function loadViewer(userId: string, orgId: string): Promise<Viewer> {
  const [{ data: profiles }, rulesRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, manager_id")
      .eq("organization_id", orgId),
    supabaseAdmin
      .from("org_access_rules")
      .select("rules")
      .eq("organization_id", orgId)
      .maybeSingle()
      .then(
        (r) => r,
        () => ({ data: null }),
      ),
  ]);
  const all = profiles ?? [];
  const me = all.find((p) => p.id === userId);
  const role = me?.role ?? null;
  const rules = parseAccessRules((rulesRes as { data: { rules: unknown } | null }).data?.rules);
  const scope = leadScopeFor(rules, role);
  const owners = ownersForScope(
    scope,
    { id: userId, managerId: me?.manager_id ?? null },
    role,
    all.map((p) => ({ id: p.id, manager_id: p.manager_id })),
  );
  return {
    orgId,
    meId: userId,
    role,
    scope,
    owners,
    people: all
      .filter((p) => p.role !== "platform_owner" && (!owners || owners.has(p.id)))
      .map((p) => ({ id: p.id, name: p.full_name || p.email || "—", role: p.role })),
    canSeeFunnel: (f) => funnelOpen(rules, role, f),
  };
}

const visible = (v: Viewer, id: string | null | undefined) =>
  !v.owners || (!!id && v.owners.has(id));

type StageRow = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  counts_as_won_override: boolean | null;
  counts_as_lost_override: boolean | null;
  probability: number | null;
  pipeline_name: string | null;
  hidden: boolean | null;
  lead_quality: string | null;
};

export async function loadFunnels(v: Viewer): Promise<{ funnels: string[]; stages: StageRow[] }> {
  const { data } = await supabaseAdmin
    .from("pipeline_stages")
    .select(
      "id, name, position, is_won, is_lost, counts_as_won_override, counts_as_lost_override, probability, pipeline_name, hidden, lead_quality",
    )
    .eq("organization_id", v.orgId)
    .order("position");
  const stages = (data ?? []) as StageRow[];
  const funnels = [...new Set(stages.map((s) => s.pipeline_name ?? ""))].filter(
    (f) => f && v.canSeeFunnel(f),
  );
  return { funnels, stages };
}

export async function gatherAnalytics(
  v: Viewer,
  r: Range,
  funnelParam: string | null,
): Promise<AnalyticsData> {
  const { funnels, stages: allStages } = await loadFunnels(v);
  const funnel = funnelParam && funnels.includes(funnelParam) ? funnelParam : (funnels[0] ?? null);
  const stages: AStage[] = allStages
    .filter((s) => (s.pipeline_name ?? "") === (funnel ?? "") && !s.hidden)
    .map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      is_won: s.is_won || !!s.counts_as_won_override,
      is_lost: s.is_lost || !!s.counts_as_lost_override,
      probability: s.probability,
      quality: s.lead_quality,
    }));
  const stageIds = stages.map((s) => s.id);
  const owners = v.owners ? [...v.owners] : null;

  const leadsRes = funnel
    ? await readAll<ALead>((a, b) => {
        let q = supabaseAdmin
          .from("leads")
          .select(
            "id, owner_id, stage_id, budget, created_at, stage_changed_at, loss_reason, source",
          )
          .eq("organization_id", v.orgId)
          .eq("funnel", funnel);
        if (owners) q = q.in("owner_id", owners);
        return q.order("created_at", { ascending: false }).range(a, b);
      })
    : { rows: [], truncated: false };
  const leads = leadsRes.rows;

  const inRange = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
    q: T,
    col: string,
  ) => q.gte(col, r.from).lt(col, r.to);

  const [moves, tasksDone, notes, pbx, amoCalls, msgs] = await Promise.all([
    readAll<{ lead_id: string; stage_id: string; entered_at: string; owner_id: string | null }>(
      (a, b) =>
        inRange(
          supabaseAdmin
            .from("lead_stage_events")
            .select("lead_id, stage_id, entered_at, owner_id")
            .eq("organization_id", v.orgId),
          "entered_at",
        ).range(a, b),
    ),
    readAll<{ assignee_id: string | null; updated_at: string }>((a, b) =>
      inRange(
        supabaseAdmin
          .from("tasks")
          .select("assignee_id, updated_at")
          .eq("organization_id", v.orgId)
          .eq("status", "Done"),
        "updated_at",
      ).range(a, b),
    ),
    readAll<{ created_by: string | null; created_at: string }>((a, b) =>
      inRange(
        supabaseAdmin
          .from("lead_activities")
          .select("created_by, created_at")
          .eq("organization_id", v.orgId)
          .eq("type", "note"),
        "created_at",
      ).range(a, b),
    ),
    readAll<{ initiated_by: string | null; created_at: string }>((a, b) =>
      inRange(
        supabaseAdmin
          .from("pbx_calls")
          .select("initiated_by, created_at")
          .eq("organization_id", v.orgId),
        "created_at",
      ).range(a, b),
    ),
    readAll<{ created_by: string | null; occurred_at: string }>((a, b) =>
      inRange(
        supabaseAdmin
          .from("amocrm_calls")
          .select("created_by, occurred_at")
          .eq("organization_id", v.orgId),
        "occurred_at",
      ).range(a, b),
    ),
    readAll<{ sent_by: string | null; created_at: string }>((a, b) =>
      inRange(
        supabaseAdmin
          .from("lead_telegram_messages")
          .select("sent_by, created_at")
          .eq("organization_id", v.orgId)
          .eq("direction", "out"),
        "created_at",
      ).range(a, b),
    ),
  ]);

  const stageSet = new Set(stageIds);
  const leadIds = new Set(leads.map((l) => l.id));
  const events: AStageEvent[] = moves.rows.filter(
    (e) => stageSet.has(e.stage_id) && leadIds.has(e.lead_id),
  );

  // Who did what: a lead counts for its owner, a stage move for the lead's
  // owner at the time, a note / task / call / message for whoever did it.
  const acts: ActivityEvent[] = [];
  const push = (actor: string | null, kind: ActivityKind, at: string) => {
    if (visible(v, actor)) acts.push({ actor, kind, at });
  };
  for (const l of leads) push(l.owner_id, "leads", l.created_at);
  for (const e of moves.rows) push(e.owner_id, "moves", e.entered_at);
  for (const x of notes.rows) push(x.created_by, "notes", x.created_at);
  for (const x of tasksDone.rows) push(x.assignee_id, "tasks", x.updated_at);
  for (const x of pbx.rows) push(x.initiated_by, "calls", x.created_at);
  for (const x of amoCalls.rows) push(x.created_by, "calls", x.occurred_at);
  for (const x of msgs.rows) push(x.sent_by, "messages", x.created_at);

  const countBy = (kind: ActivityKind) => {
    const m = new Map<string, number>();
    for (const a of acts) if (a.kind === kind && a.actor) m.set(a.actor, (m.get(a.actor) ?? 0) + 1);
    return m;
  };

  return {
    range: r,
    funnels,
    funnel,
    scope: v.scope ?? "all",
    people: v.people,
    sales: salesAnalysis(leads, stages, events, r),
    summary: summaryByOwner(leads, stages, r, {
      tasksDone: countBy("tasks"),
      calls: countBy("calls"),
      messages: countBy("messages"),
    }),
    winLoss: winLoss(leads, stages, r),
    truncated: [leadsRes, moves, tasksDone, notes, pbx, amoCalls, msgs].some((x) => x.truncated),
  };
}
