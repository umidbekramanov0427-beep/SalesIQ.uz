// Called on a schedule (see the accompanying pg_cron migration, 21:00
// Tashkent daily) -- same shared-secret pattern as
// audio-analytics.analyze-pending.ts.
//
// This checks each org's *configured* fine types against real CRM state --
// not an AI reading of call transcripts. The seeded "CRM bilan ishlash
// bo'yicha jarimalar reglamenti" (see 20260903020000_...) is entirely about
// lead/task/stage hygiene (an unworked new lead, an overdue task, a Lost
// lead with no reason, an unanswered incoming call), none of which an LLM
// judging a call transcript could ever answer reliably -- these are exact,
// checkable facts in the database, so they're computed deterministically
// here instead. Matched by the fine type's exact `name` against a fixed set
// of known rule keys below; a fine type whose name doesn't match any known
// rule is left alone (not computed, no guessing).
//
// Every check reads is_won/is_lost (already admin-overridable per org on
// the "CRM natija bosqichlari" settings tab) and each pipeline's own stage
// `position` ordering -- never a hardcoded stage name -- so this keeps
// working correctly no matter how a given company's AmoCRM pipeline is
// actually named or laid out.
//
// NOT automated yet (left for manual entry via "Jarima qo'shish"):
//   - "Sotuvdan keyin o'tkazilmagan lid" / "So'rovsiz lid olish" -- need a
//     precise definition of the org's own "sotuv etapi" and an ownership-
//     change audit trail to check against.
//   - "Noto'g'ri lid holati" -- too general to check mechanically without a
//     concrete per-stage rule.
//   - "CRM ga kiritilmagan tashrif" -- a visitor never entered into the CRM
//     is by definition invisible to it; needs an external record (e.g. a
//     reception log) to cross-check against, which nothing here provides.
//   - The "noto'g'ri sabab" (wrong reason, vs. simply missing) nuance of
//     the LOST rule -- only the "no reason at all" half is checked here.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseControlSettings } from "@/lib/control-settings";

function tashkentToday(): { dateStr: string; startIso: string; endIso: string } {
  const now = new Date();
  const tashkentNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const dateStr = tashkentNow.toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T00:00:00+05:00`);
  const end = new Date(`${dateStr}T23:59:59+05:00`);
  return { dateStr, startIso: start.toISOString(), endIso: end.toISOString() };
}

type FineTypeRow = {
  id: string;
  name: string;
  rule_key?: string | null;
  auto?: boolean | null;
  default_amount: number | null;
  target_positions: string[] | null;
};

type LeadRow = {
  id: string;
  owner_id: string | null;
  stage_id: string | null;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
};

type StageRow = {
  id: string;
  pipeline_name: string | null;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  counts_as_won_override: boolean | null;
  counts_as_lost_override: boolean | null;
};

function isFinalStage(s: StageRow): boolean {
  return (s.counts_as_won_override ?? s.is_won) || (s.counts_as_lost_override ?? s.is_lost);
}
function isLostStage(s: StageRow): boolean {
  return s.counts_as_lost_override ?? s.is_lost;
}

async function insertIfNew(
  organizationId: string,
  fineTypeId: string,
  profileId: string,
  dateStr: string,
  amount: number,
  reason: string,
): Promise<boolean> {
  const { data: existing } = await supabaseAdmin
    .from("fines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .eq("fine_type_id", fineTypeId)
    .eq("occurred_on", dateStr)
    .eq("source", "ai")
    .maybeSingle();
  if (existing) return false;
  const rules = orgFineRules.get(organizationId) ?? parseControlSettings(null).fines;
  // Nazorat → Jarimalar → Sozlash: at most this much per person per month.
  if (rules.monthlyCap) {
    const monthStart = `${dateStr.slice(0, 7)}-01`;
    const { data: month } = await supabaseAdmin
      .from("fines")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("profile_id", profileId)
      .gte("occurred_on", monthStart)
      .lte("occurred_on", dateStr);
    const sum = (month ?? []).reduce((a, r) => a + Number(r.amount), 0);
    if (sum >= rules.monthlyCap) return false;
    amount = Math.min(amount, rules.monthlyCap - sum);
  }
  const { error } = await supabaseAdmin.from("fines").insert({
    organization_id: organizationId,
    profile_id: profileId,
    fine_type_id: fineTypeId,
    amount,
    occurred_on: dateStr,
    reason,
    source: "ai",
  });
  if (!error && rules.notifyPerson) {
    await supabaseAdmin
      .from("notifications")
      .insert({
        organization_id: organizationId,
        user_id: profileId,
        type: "Fine",
        title: "Jarima yozildi",
        body: reason,
        link: "/attendance?tab=jarimalar",
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
  return !error;
}

/** Each company's fine rules for this run (Nazorat → Jarimalar → Sozlash). */
const orgFineRules = new Map<string, ReturnType<typeof parseControlSettings>["fines"]>();

async function checkUnworkedNewLeads(
  organizationId: string,
  fineType: FineTypeRow,
  dateStr: string,
  startIso: string,
  endIso: string,
  eligibleProfileIds: Set<string> | null,
): Promise<number> {
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, owner_id, stage_id, loss_reason, created_at, updated_at")
    .eq("organization_id", organizationId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .returns<LeadRow[]>();
  if (!leads || leads.length === 0) return 0;

  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select(
      "id, pipeline_name, position, is_won, is_lost, counts_as_won_override, counts_as_lost_override",
    )
    .eq("organization_id", organizationId)
    .returns<StageRow[]>();
  const stagesById = new Map((stages ?? []).map((s) => [s.id, s]));

  // The "new lead" stage of a pipeline is whichever non-final stage sorts
  // first -- not a hardcoded name, so this still works whatever this org
  // called their own first stage in AmoCRM.
  const firstStageByPipeline = new Map<string, number>();
  for (const s of stages ?? []) {
    if (isFinalStage(s)) continue;
    const key = s.pipeline_name ?? "";
    const cur = firstStageByPipeline.get(key);
    if (cur == null || s.position < cur) firstStageByPipeline.set(key, s.position);
  }

  let created = 0;
  for (const lead of leads) {
    if (!lead.owner_id || !lead.stage_id) continue;
    if (eligibleProfileIds && !eligibleProfileIds.has(lead.owner_id)) continue;
    const stage = stagesById.get(lead.stage_id);
    if (!stage) continue;
    const firstPos = firstStageByPipeline.get(stage.pipeline_name ?? "");
    if (firstPos == null || stage.position !== firstPos) continue;
    // Untouched: never moved/edited since creation.
    if (lead.updated_at !== lead.created_at) continue;
    const ok = await insertIfNew(
      organizationId,
      fineType.id,
      lead.owner_id,
      dateStr,
      fineType.default_amount ?? 0,
      "Yangi lid etapida kun oxirigacha ishlanmay qoldi.",
    );
    if (ok) created++;
  }
  return created;
}

async function checkOverdueTasks(
  organizationId: string,
  fineType: FineTypeRow,
  dateStr: string,
  endIso: string,
  eligibleProfileIds: Set<string> | null,
): Promise<number> {
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("id, assignee_id, due_date, status")
    .eq("organization_id", organizationId)
    .lte("due_date", endIso)
    .neq("status", "Done")
    .returns<{ id: string; assignee_id: string | null; due_date: string | null }[]>();
  if (!tasks || tasks.length === 0) return 0;

  let created = 0;
  for (const t of tasks) {
    if (!t.assignee_id) continue;
    if (eligibleProfileIds && !eligibleProfileIds.has(t.assignee_id)) continue;
    const ok = await insertIfNew(
      organizationId,
      fineType.id,
      t.assignee_id,
      dateStr,
      fineType.default_amount ?? 0,
      "Muddati o'tgan, bajarilmagan vazifa.",
    );
    if (ok) created++;
  }
  return created;
}

async function checkLostWithoutReason(
  organizationId: string,
  fineType: FineTypeRow,
  dateStr: string,
  startIso: string,
  endIso: string,
  eligibleProfileIds: Set<string> | null,
): Promise<number> {
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, owner_id, stage_id, loss_reason, created_at, updated_at")
    .eq("organization_id", organizationId)
    .gte("updated_at", startIso)
    .lte("updated_at", endIso)
    .returns<LeadRow[]>();
  if (!leads || leads.length === 0) return 0;

  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, position, is_won, is_lost, counts_as_won_override, counts_as_lost_override")
    .eq("organization_id", organizationId)
    .returns<StageRow[]>();
  const lostStageIds = new Set((stages ?? []).filter(isLostStage).map((s) => s.id));

  let created = 0;
  for (const lead of leads) {
    if (!lead.owner_id || !lead.stage_id) continue;
    if (eligibleProfileIds && !eligibleProfileIds.has(lead.owner_id)) continue;
    if (!lostStageIds.has(lead.stage_id)) continue;
    if (lead.loss_reason && lead.loss_reason.trim()) continue;
    const ok = await insertIfNew(
      organizationId,
      fineType.id,
      lead.owner_id,
      dateStr,
      fineType.default_amount ?? 0,
      "Lid LOST etapiga sababsiz o'tkazildi.",
    );
    if (ok) created++;
  }
  return created;
}

async function checkUnansweredIncomingCalls(
  organizationId: string,
  fineType: FineTypeRow,
  dateStr: string,
  startIso: string,
  endIso: string,
  eligibleProfileIds: Set<string> | null,
): Promise<number> {
  const { data: calls } = await supabaseAdmin
    .from("amocrm_calls")
    .select("id, lead_id, connected, direction")
    .eq("organization_id", organizationId)
    .eq("direction", "in")
    .eq("connected", false)
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .returns<{ id: string; lead_id: string | null }[]>();
  if (!calls || calls.length === 0) return 0;

  const leadIds = [...new Set(calls.map((c) => c.lead_id).filter((x): x is string => !!x))];
  if (leadIds.length === 0) return 0;
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, owner_id")
    .in("id", leadIds)
    .returns<{ id: string; owner_id: string | null }[]>();
  const ownerByLead = new Map((leads ?? []).map((l) => [l.id, l.owner_id]));

  let created = 0;
  for (const call of calls) {
    const ownerId = call.lead_id ? ownerByLead.get(call.lead_id) : null;
    if (!ownerId) continue;
    if (eligibleProfileIds && !eligibleProfileIds.has(ownerId)) continue;
    const ok = await insertIfNew(
      organizationId,
      fineType.id,
      ownerId,
      dateStr,
      fineType.default_amount ?? 0,
      "Kiruvchi qo'ng'iroqqa javob berilmadi.",
    );
    if (ok) created++;
  }
  return created;
}

const RULE_CHECKS: Record<
  string,
  (
    organizationId: string,
    fineType: FineTypeRow,
    dateStr: string,
    startIso: string,
    endIso: string,
    eligibleProfileIds: Set<string> | null,
  ) => Promise<number>
> = {
  "Ishlanmagan yangi lid": (org, ft, d, s, e, elig) =>
    checkUnworkedNewLeads(org, ft, d, s, e, elig),
  "Bajarilmagan zadacha": (org, ft, d, _s, e, elig) => checkOverdueTasks(org, ft, d, e, elig),
  "Noto'g'ri LOST": (org, ft, d, s, e, elig) => checkLostWithoutReason(org, ft, d, s, e, elig),
  "Javobsiz kiruvchi aloqa": (org, ft, d, s, e, elig) =>
    checkUnansweredIncomingCalls(org, ft, d, s, e, elig),
};

export const Route = createFileRoute("/fines/compute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        const got = request.headers.get("x-cron-secret");
        if (!expected || got !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { dateStr, startIso, endIso } = tashkentToday();

        // select("*"): before the Nazorat settings update there is no
        // rule_key / auto yet -- then the type's name is its rule.
        const { data: fineTypes } = await supabaseAdmin
          .from("fine_types")
          .select("*")
          .not("default_amount", "is", null)
          .returns<(FineTypeRow & { organization_id: string })[]>();

        const orgIds = [...new Set((fineTypes ?? []).map((f) => f.organization_id))];
        orgFineRules.clear();
        if (orgIds.length) {
          const { data: settings } = await supabaseAdmin
            .from("org_general_settings")
            .select("*")
            .in("organization_id", orgIds);
          for (const row of settings ?? []) {
            const raw = (row as { control_settings?: unknown }).control_settings;
            orgFineRules.set(row.organization_id, parseControlSettings(raw).fines);
          }
        }

        let typesChecked = 0;
        let finesCreated = 0;

        for (const fineType of fineTypes ?? []) {
          if (orgFineRules.get(fineType.organization_id)?.auto === false) continue;
          if (fineType.auto === false) continue;
          const check = RULE_CHECKS[fineType.rule_key ?? fineType.name];
          if (!check) continue;
          try {
            let eligibleProfileIds: Set<string> | null = null;
            if (fineType.target_positions && fineType.target_positions.length > 0) {
              const { data: profiles } = await supabaseAdmin
                .from("profiles")
                .select("id, position")
                .eq("organization_id", fineType.organization_id)
                .in("position", fineType.target_positions);
              eligibleProfileIds = new Set((profiles ?? []).map((p) => p.id));
            }
            const created = await check(
              fineType.organization_id,
              fineType,
              dateStr,
              startIso,
              endIso,
              eligibleProfileIds,
            );
            finesCreated += created;
            typesChecked++;
          } catch (err) {
            console.error(`[fines.compute] fine_type ${fineType.id} failed:`, err);
          }
        }

        return Response.json({ typesChecked, finesCreated });
      },
    },
  },
});
