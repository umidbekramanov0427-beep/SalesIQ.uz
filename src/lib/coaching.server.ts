// Server-only. The coaching cycle's data: a company's analysed calls as
// one done/not-done per script stage, attributed to the lead's manager,
// and its coaching tasks with the "after" rate counted live. Rules are in
// coaching.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { coachingVerdict, rateFor, stagesOf, weakSpots, type CoachingCall } from "@/lib/coaching";

const MAX_CALLS = 5000;
/** Weak spots are judged on the last 60 days; a task's "before" too. */
export const BASELINE_DAYS = 60;

export async function loadCoachingCalls(organizationId: string, sinceDays = 180) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("amocrm_calls")
    .select("lead_id, occurred_at, checklist:analysis->checklist")
    .eq("organization_id", organizationId)
    .not("analysis", "is", null)
    .not("lead_id", "is", null)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(MAX_CALLS);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    lead_id: string;
    occurred_at: string;
    checklist: unknown;
  }[];
  const ids = [...new Set(rows.map((r) => r.lead_id))];
  const owner = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, owner_id")
      .eq("organization_id", organizationId)
      .in("id", ids.slice(i, i + 200));
    for (const l of leads ?? []) owner.set(l.id, l.owner_id);
  }
  const calls: CoachingCall[] = [];
  for (const r of rows) {
    const list = Array.isArray(r.checklist) ? (r.checklist as Record<string, unknown>[]) : [];
    const stages = stagesOf(
      list.map((i) => ({
        stage: typeof i["stage"] === "string" ? i["stage"] : null,
        step: typeof i["step"] === "string" ? i["step"] : null,
        met: i["met"] === true,
      })),
    );
    if (Object.keys(stages).length === 0) continue;
    calls.push({ ownerId: owner.get(r.lead_id) ?? null, at: r.occurred_at, stages });
  }
  return calls;
}

export type CoachingTaskView = {
  id: string;
  profileId: string;
  criterion: string;
  task: string;
  lessonId: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  doneAt: string | null;
  before: number | null;
  beforeCalls: number;
  after: { rate: number; total: number };
  verdict: ReturnType<typeof coachingVerdict>;
};

export async function coachingOverview(
  organizationId: string,
  viewer: { id: string; boss: boolean; team: string[] | null },
) {
  const calls = await loadCoachingCalls(organizationId);
  const recentFrom = new Date(Date.now() - BASELINE_DAYS * 86_400_000).toISOString();
  const recent = calls.filter((c) => c.at >= recentFrom);
  let tq = supabaseAdmin
    .from("coaching_tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (!viewer.boss) tq = tq.eq("profile_id", viewer.id);
  else if (viewer.team) tq = tq.in("profile_id", viewer.team);
  const { data: rows, error } = await tq;
  if (error) return { missing: true as const };
  const tasks: CoachingTaskView[] = (rows ?? []).map((r) => {
    const after = rateFor(calls, r.profile_id, r.criterion, r.created_at, null);
    return {
      id: r.id,
      profileId: r.profile_id,
      criterion: r.criterion,
      task: r.task,
      lessonId: r.lesson_id,
      status: r.status,
      dueDate: r.due_date,
      createdAt: r.created_at,
      doneAt: r.done_at,
      before: r.baseline_rate,
      beforeCalls: r.baseline_calls,
      after: { rate: after.rate, total: after.total },
      verdict: coachingVerdict(r.baseline_rate, after),
    };
  });
  const sees = (id: string) =>
    viewer.boss ? !viewer.team || viewer.team.includes(id) : id === viewer.id;
  const weak = weakSpots(recent).filter((w) => sees(w.ownerId));
  return { missing: false as const, weak, tasks };
}

/** A manager's rate on one stage over the last BASELINE_DAYS -- the task's "before". */
export async function baselineFor(organizationId: string, profileId: string, criterion: string) {
  const calls = await loadCoachingCalls(organizationId, BASELINE_DAYS);
  return rateFor(calls, profileId, criterion, null, null);
}
