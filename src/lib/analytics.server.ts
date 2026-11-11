import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  activity,
  forecast,
  salesAnalysis,
  summaryByOwner,
  winLoss,
  type ActivityEvent,
  type AnalyticsData,
  type ActivityKind,
  type ALead,
  type AStage,
  type AStageEvent,
  type EventKind,
  type LogEvent,
  type Range,
} from "@/lib/analytics-reports";

export { EVENT_KINDS, parseRange, type EventKind } from "@/lib/analytics-reports";
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
};

export async function loadFunnels(v: Viewer): Promise<{ funnels: string[]; stages: StageRow[] }> {
  const { data } = await supabaseAdmin
    .from("pipeline_stages")
    .select(
      "id, name, position, is_won, is_lost, counts_as_won_override, counts_as_lost_override, probability, pipeline_name, hidden",
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
    activity: activity(acts, r, TZ_OFFSET_MIN),
    forecast: forecast(leads, stages),
    truncated: [leadsRes, moves, tasksDone, notes, pbx, amoCalls, msgs].some((x) => x.truncated),
  };
}

// ---- Hodisalar jurnali ------------------------------------------------------

const LOG_PAGE = 50;

/** The company's events in the range, newest first, one page at a time. */
export async function gatherEvents(
  v: Viewer,
  r: Range,
  opts: { kind: EventKind | null; actor: string | null; page: number },
): Promise<{ events: LogEvent[]; hasMore: boolean }> {
  const want = (k: EventKind) => !opts.kind || opts.kind === k;
  const take = (opts.page + 1) * LOG_PAGE + 1;
  // Whose events: one person (if the caller may see them), or the caller's scope.
  if (opts.actor && !visible(v, opts.actor)) return { events: [], hasMore: false };
  const actors = opts.actor ? [opts.actor] : v.owners ? [...v.owners] : null;

  type Q = {
    in: (c: string, v: string[]) => Q;
    gte: (c: string, v: string) => Q;
    lt: (c: string, v: string) => Q;
    order: (c: string, o: { ascending: boolean }) => Q;
    limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
  };
  const run = async <T>(q: unknown, actorCol: string | null, timeCol: string): Promise<T[]> => {
    let x = q as Q;
    if (actors && actorCol) x = x.in(actorCol, actors);
    const { data, error } = await x
      .gte(timeCol, r.from)
      .lt(timeCol, r.to)
      .order(timeCol, { ascending: false })
      .limit(take);
    return error ? [] : ((data ?? []) as T[]);
  };
  const org = v.orgId;
  const out: LogEvent[] = [];

  const [leads, stages, notes, tasks, calls, msgs, pays, stageNames] = await Promise.all([
    want("lead")
      ? run<{
          id: string;
          name: string | null;
          owner_id: string | null;
          created_at: string;
          source: string | null;
        }>(
          supabaseAdmin
            .from("leads")
            .select("id, name, owner_id, created_at, source")
            .eq("organization_id", org),
          "owner_id",
          "created_at",
        )
      : [],
    want("stage")
      ? run<{ lead_id: string; stage_id: string; owner_id: string | null; entered_at: string }>(
          supabaseAdmin
            .from("lead_stage_events")
            .select("lead_id, stage_id, owner_id, entered_at")
            .eq("organization_id", org),
          "owner_id",
          "entered_at",
        )
      : [],
    want("note")
      ? run<{
          lead_id: string;
          created_by: string | null;
          created_at: string;
          content: string | null;
        }>(
          supabaseAdmin
            .from("lead_activities")
            .select("lead_id, created_by, created_at, content")
            .eq("organization_id", org)
            .eq("type", "note"),
          "created_by",
          "created_at",
        )
      : [],
    want("task")
      ? run<{
          lead_id: string | null;
          assignee_id: string | null;
          updated_at: string;
          title: string | null;
        }>(
          supabaseAdmin
            .from("tasks")
            .select("lead_id, assignee_id, updated_at, title")
            .eq("organization_id", org)
            .eq("status", "Done"),
          "assignee_id",
          "updated_at",
        )
      : [],
    want("call")
      ? run<{
          lead_id: string | null;
          initiated_by: string | null;
          created_at: string;
          direction: string;
          duration_seconds: number;
          missed: boolean;
        }>(
          supabaseAdmin
            .from("pbx_calls")
            .select("lead_id, initiated_by, created_at, direction, duration_seconds, missed")
            .eq("organization_id", org),
          "initiated_by",
          "created_at",
        )
      : [],
    want("message")
      ? run<{
          lead_id: string;
          sent_by: string | null;
          created_at: string;
          text: string | null;
          channel: string;
        }>(
          supabaseAdmin
            .from("lead_telegram_messages")
            .select("lead_id, sent_by, created_at, text, channel")
            .eq("organization_id", org)
            .eq("direction", "out"),
          "sent_by",
          "created_at",
        )
      : [],
    want("payment")
      ? run<{
          lead_id: string;
          created_by: string | null;
          paid_at: string;
          amount: number;
          method: string | null;
        }>(
          supabaseAdmin
            .from("lead_payments")
            .select("lead_id, created_by, paid_at, amount, method")
            .eq("organization_id", org),
          "created_by",
          "paid_at",
        )
      : [],
    want("stage")
      ? supabaseAdmin
          .from("pipeline_stages")
          .select("id, name")
          .eq("organization_id", org)
          .then((x) => new Map((x.data ?? []).map((s) => [s.id, s.name])))
      : new Map<string, string>(),
  ]);

  const clip = (s: string | null | undefined, n = 90) => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };
  for (const x of leads)
    out.push({
      at: x.created_at,
      kind: "lead",
      actor: x.owner_id,
      leadId: x.id,
      leadName: x.name,
      text: clip(x.source),
    });
  for (const x of stages)
    out.push({
      at: x.entered_at,
      kind: "stage",
      actor: x.owner_id,
      leadId: x.lead_id,
      leadName: null,
      text: stageNames.get(x.stage_id) ?? "",
    });
  for (const x of notes)
    out.push({
      at: x.created_at,
      kind: "note",
      actor: x.created_by,
      leadId: x.lead_id,
      leadName: null,
      text: clip(x.content),
    });
  for (const x of tasks)
    out.push({
      at: x.updated_at,
      kind: "task",
      actor: x.assignee_id,
      leadId: x.lead_id,
      leadName: null,
      text: clip(x.title),
    });
  for (const x of calls)
    out.push({
      at: x.created_at,
      kind: "call",
      actor: x.initiated_by,
      leadId: x.lead_id,
      leadName: null,
      text: `${x.missed ? "missed" : x.direction === "outgoing" ? "out" : "in"}:${x.duration_seconds ?? 0}`,
    });
  for (const x of msgs)
    out.push({
      at: x.created_at,
      kind: "message",
      actor: x.sent_by,
      leadId: x.lead_id,
      leadName: null,
      text: clip(x.text),
    });
  for (const x of pays)
    out.push({
      at: x.paid_at,
      kind: "payment",
      actor: x.created_by,
      leadId: x.lead_id,
      leadName: null,
      text: String(x.amount ?? 0),
    });

  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const start = opts.page * LOG_PAGE;
  const pageRows = out.slice(start, start + LOG_PAGE);
  const hasMore = out.length > start + LOG_PAGE;

  // Lead names for the page, in one query (only the company's leads).
  const missing = [
    ...new Set(pageRows.filter((e) => e.leadId && !e.leadName).map((e) => e.leadId!)),
  ];
  if (missing.length) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id, name")
      .eq("organization_id", org)
      .in("id", missing);
    const names = new Map((data ?? []).map((l) => [l.id, l.name]));
    for (const e of pageRows) if (e.leadId && !e.leadName) e.leadName = names.get(e.leadId) ?? null;
  }
  return { events: pageRows, hasMore };
}
