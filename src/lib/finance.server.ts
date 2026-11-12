import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadFunnels, type Viewer } from "@/lib/analytics.server";
import {
  marketingBySource,
  monthForecast,
  monthlyRevenue,
  profitAndLoss,
  type FLead,
  type FRange,
  type FinEntry,
  type FinanceData,
} from "@/lib/finance";

// Analitika -> Reklama / Moliya / Prognoz: gathered with the service role,
// pinned to the caller's company and cut to the leads they may see. Ad
// spend by source for admins and heads of sales; the P&L and the raw
// income/expense lines only for the company's admin.

const MAX = 20_000;
const PAGE = 1000;

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX; i += PAGE) {
    const { data, error } = await page(i, i + PAGE - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: rows.length >= MAX };
}

export async function gatherFinance(v: Viewer, r: FRange, now = new Date()): Promise<FinanceData> {
  const { stages: allStages, funnels } = await loadFunnels(v);
  const stages = allStages.filter((s) => funnels.includes(s.pipeline_name ?? ""));
  const won = new Set(stages.filter((s) => s.is_won || s.counts_as_won_override).map((s) => s.id));
  const closed = new Set(
    stages
      .filter((s) => s.is_won || s.is_lost || s.counts_as_won_override || s.counts_as_lost_override)
      .map((s) => s.id),
  );
  const probability = new Map(
    stages.map((s) => [s.id, Math.max(0, Math.min(100, s.probability ?? 0))]),
  );
  const owners = v.owners ? [...v.owners] : null;

  // Six months back for the trend, and the period itself if it starts earlier.
  const local = new Date(now.getTime() + 5 * 3_600_000);
  const sixAgo = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 5, 1) - 5 * 3_600_000,
  ).toISOString();
  const since = r.from < sixAgo ? r.from : sixAgo;

  type Row = {
    source: string | null;
    created_at: string;
    stage_changed_at: string | null;
    budget: number | null;
    stage_id: string | null;
    funnel: string | null;
  };
  const res = await readAll<Row>((a, b) => {
    let q = supabaseAdmin
      .from("leads")
      .select("source, created_at, stage_changed_at, budget, stage_id, funnel")
      .eq("organization_id", v.orgId)
      .or(`created_at.gte.${since},stage_changed_at.gte.${since}`);
    if (owners) q = q.in("owner_id", owners);
    return q.order("created_at", { ascending: false }).range(a, b);
  });
  const rows = res.rows.filter((l) => !l.funnel || v.canSeeFunnel(l.funnel));
  const leads: FLead[] = rows.map((l) => ({
    source: l.source,
    created_at: l.created_at,
    stage_changed_at: l.stage_changed_at,
    budget: l.budget,
    won: !!l.stage_id && won.has(l.stage_id),
  }));

  // Open deals of every age, weighted by their stage's probability.
  const openStages = stages.filter((s) => !closed.has(s.id)).map((s) => s.id);
  let pipelineWeighted = 0;
  if (openStages.length) {
    const open = await readAll<{ stage_id: string | null; budget: number | null }>((a, b) => {
      let q = supabaseAdmin
        .from("leads")
        .select("stage_id, budget")
        .eq("organization_id", v.orgId)
        .in("stage_id", openStages);
      if (owners) q = q.in("owner_id", owners);
      return q.range(a, b);
    });
    for (const l of open.rows) {
      pipelineWeighted +=
        ((Number(l.budget) || 0) * (probability.get(l.stage_id ?? "") ?? 0)) / 100;
    }
  }

  const fromDay = new Date(new Date(r.from).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const toDay = new Date(new Date(r.to).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const { data: entryRows, error } = await supabaseAdmin
    .from("finance_entries")
    .select("id, entry_date, kind, category, source, amount, note")
    .eq("organization_id", v.orgId)
    .gte("entry_date", fromDay)
    .lt("entry_date", toDay)
    .order("entry_date", { ascending: false })
    .limit(5000);
  // Before the migration has run the table is missing: no spend yet.
  const entries: FinEntry[] = error
    ? []
    : (entryRows ?? []).map((e) => ({
        ...e,
        kind: e.kind === "income" ? "income" : "expense",
        amount: Number(e.amount) || 0,
      }));

  const isAdmin = v.role === "super_admin" || v.role === "platform_owner";
  const months = monthlyRevenue(leads, now);
  const salesRevenue = leads
    .filter(
      (l) =>
        l.won && !!l.stage_changed_at && l.stage_changed_at >= r.from && l.stage_changed_at < r.to,
    )
    .reduce((s, l) => s + (Number(l.budget) || 0), 0);
  const sources = [
    ...new Set(rows.map((l) => l.source?.trim()).filter((s): s is string => !!s)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    marketing: marketingBySource(leads, entries, r),
    pnl: isAdmin ? profitAndLoss(salesRevenue, entries, r) : null,
    entries: isAdmin ? entries : null,
    months,
    forecast: monthForecast(months, now, pipelineWeighted),
    sources,
    truncated: res.truncated,
  };
}
