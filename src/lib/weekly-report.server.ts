import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { orgPhase } from "@/lib/org-access";
import { loadAllOrgAccess } from "@/lib/org-access.server";
import { companyOrigin } from "@/lib/subdomain";
import {
  isReportTime,
  lastWeek,
  weeklyReportText,
  type WeekNumbers,
  type WeeklyFacts,
} from "@/lib/weekly-report";

// Monday 09:00 Tashkent: each company's super admins with a linked
// Telegram get last week's numbers (src/lib/weekly-report.ts). Run by the
// 5-minute Telegram cron; platform_ops_log ("weekly:<org>:<monday>")
// makes it once per company per week. Companies that turned their
// reports off (daily_report_settings.send_enabled), expired or frozen
// ones get nothing.

const iso = (ms: number) => new Date(ms).toISOString();

async function weekNumbers(
  orgId: string,
  wonStageIds: string[],
  from: number,
  to: number,
): Promise<WeekNumbers & { wonRows: { owner_id: string | null }[] }> {
  const [leads, won, paid, calls, missed] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", iso(from))
      .lt("created_at", iso(to)),
    wonStageIds.length
      ? supabaseAdmin
          .from("leads")
          .select("budget, owner_id")
          .eq("organization_id", orgId)
          .in("stage_id", wonStageIds)
          .gte("stage_changed_at", iso(from))
          .lt("stage_changed_at", iso(to))
          .limit(5000)
      : Promise.resolve({ data: [] as { budget: number; owner_id: string | null }[] }),
    supabaseAdmin
      .from("lead_payment_links")
      .select("amount")
      .eq("organization_id", orgId)
      .eq("status", "paid")
      .gte("paid_at", iso(from))
      .lt("paid_at", iso(to))
      .limit(5000),
    supabaseAdmin
      .from("pbx_calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", iso(from))
      .lt("created_at", iso(to)),
    supabaseAdmin
      .from("pbx_calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("missed", true)
      .gte("created_at", iso(from))
      .lt("created_at", iso(to)),
  ]);
  const wonRows = (won.data ?? []) as { budget: number; owner_id: string | null }[];
  return {
    newLeads: leads.count ?? 0,
    won: wonRows.length,
    wonAmount: wonRows.reduce((s, r) => s + Number(r.budget || 0), 0),
    collected: (paid.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0),
    calls: calls.count ?? 0,
    missedCalls: missed.count ?? 0,
    wonRows,
  };
}

export async function gatherWeeklyFacts(
  orgId: string,
  company: string,
  subdomain: string | null,
  now: number,
): Promise<WeeklyFacts> {
  const w = lastWeek(now);
  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, is_won, counts_as_won_override")
    .eq("organization_id", orgId);
  const wonStageIds = (stages ?? [])
    .filter((s) => s.counts_as_won_override ?? s.is_won)
    .map((s) => s.id);
  const [week, prev, overdue] = await Promise.all([
    weekNumbers(orgId, wonStageIds, w.from, w.to),
    weekNumbers(orgId, wonStageIds, w.prevFrom, w.from),
    supabaseAdmin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .neq("status", "Done")
      .lt("due_date", iso(now)),
  ]);

  const byOwner = new Map<string, number>();
  for (const r of week.wonRows)
    if (r.owner_id) byOwner.set(r.owner_id, (byOwner.get(r.owner_id) ?? 0) + 1);
  const best = [...byOwner.entries()].sort((a, b) => b[1] - a[1])[0];
  let topManager: WeeklyFacts["topManager"] = null;
  if (best) {
    const { data: person } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", best[0])
      .maybeSingle();
    topManager = { name: person?.full_name || "—", won: best[1] };
  }
  const strip = ({ wonRows: _w, ...n }: typeof week): WeekNumbers => n;
  return {
    company,
    week: strip(week),
    prev: strip(prev),
    topManager,
    overdueTasks: overdue.count ?? 0,
    appUrl: companyOrigin(subdomain),
  };
}

export async function sendWeeklyOwnerReports(now = Date.now()): Promise<{ sent: number }> {
  if (!isReportTime(now)) return { sent: 0 };
  const w = lastWeek(now);
  const access = await loadAllOrgAccess();
  const { data: orgs } = await supabaseAdmin.from("organizations").select("*");
  const { data: done } = await supabaseAdmin
    .from("platform_ops_log")
    .select("key")
    .like("key", `weekly:%:${w.monday}`);
  const doneKeys = new Set((done ?? []).map((r) => r.key));
  const { sendTelegramMessage } = await import("@/lib/telegram-report.server");
  let sent = 0;
  for (const raw of orgs ?? []) {
    const org = raw as Record<string, unknown>;
    const id = org["id"] as string;
    if (doneKeys.has(`weekly:${id}:${w.monday}`)) continue;
    const a = access.get(id);
    if (!a || orgPhase(a) === "expired" || org["frozen_at"] || org["active"] === false) continue;

    const { data: settings } = await supabaseAdmin
      .from("daily_report_settings")
      .select("send_enabled")
      .eq("organization_id", id)
      .maybeSingle();
    if (!(settings?.send_enabled ?? true)) continue;

    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id")
      .eq("organization_id", id)
      .eq("role", "super_admin")
      .not("telegram_chat_id", "is", null);
    if (!owners?.length) continue;

    // Claim this company's week first: a second overlapping tick skips it.
    const { error: claimErr } = await supabaseAdmin
      .from("platform_ops_log")
      .insert({ key: `weekly:${id}:${w.monday}` });
    if (claimErr) continue;

    const facts = await gatherWeeklyFacts(
      id,
      (org["name"] as string) || "SalesIQ",
      (org["subdomain"] as string | null) ?? null,
      now,
    );
    const text = weeklyReportText(facts, w);
    for (const o of owners) {
      try {
        await sendTelegramMessage(Number(o.telegram_chat_id), text);
        sent++;
      } catch {
        // Bot blocked by this person: the others still get it.
      }
    }
  }
  return { sent };
}
