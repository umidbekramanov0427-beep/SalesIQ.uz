import { leadInProject, type ProjectRule } from "@/lib/marketing-projects";
import { META_SOURCE, metaCampaigns, normCampaign, toUzs } from "@/lib/meta-ads";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestUserId } from "@/lib/auth.server";
import {
  marketingBySource,
  monthlyRevenue,
  type FRange,
  type FinEntry,
  type FLead,
} from "@/lib/finance";
import {
  campaignOf,
  canUseMarketing,
  leadsByDay,
  qualityBy,
  type MarketingData,
  type QLead,
  type Temperature,
} from "@/lib/marketing";

// The marketing panel's figures, company-wide (marketing looks at every
// lead the company got, not one manager's): gathered with the service role
// and pinned to the caller's company. Only admins, marketologs and people
// the admin let in; clients' names, chats and phones never leave here.

export async function requireMarketingMember(
  request: Request,
): Promise<{ id: string; organizationId: string; role: string } | null> {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  const p = data as {
    organization_id: string | null;
    role: string;
    marketing_access?: boolean;
  } | null;
  if (!p?.organization_id) return null;
  if (!canUseMarketing({ role: p.role, marketingAccess: p.marketing_access === true })) return null;
  return { id: userId, organizationId: p.organization_id, role: p.role };
}

const MAX = 20_000;
const PAGE = 1000;
const TEMPS = new Set(["VeryHot", "Hot", "Warm", "Cold"]);

export async function gatherMarketing(
  orgId: string,
  r: FRange,
  now = new Date(),
  project: (Pick<ProjectRule, "funnels" | "utm_campaigns"> & { id: string }) | null = null,
): Promise<MarketingData> {
  const { data: stageRows } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, is_won, is_lost, counts_as_won_override, counts_as_lost_override")
    .eq("organization_id", orgId);
  const won = new Set(
    (stageRows ?? []).filter((s) => s.is_won || s.counts_as_won_override).map((s) => s.id),
  );
  const lost = new Set(
    (stageRows ?? []).filter((s) => s.is_lost || s.counts_as_lost_override).map((s) => s.id),
  );

  const local = new Date(now.getTime() + 5 * 3_600_000);
  const sixAgo = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 5, 1) - 5 * 3_600_000,
  ).toISOString();
  const since = r.from < sixAgo ? r.from : sixAgo;

  type Row = {
    source: string | null;
    campaign: string | null;
    utm: unknown;
    created_at: string;
    stage_changed_at: string | null;
    budget: number | null;
    stage_id: string | null;
    score: number | null;
    temperature: string | null;
    funnel: string | null;
  };
  const rows: Row[] = [];
  let truncated = false;
  for (let i = 0; i < MAX; i += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(
        "source, campaign, utm, created_at, stage_changed_at, budget, stage_id, score, temperature, funnel",
      )
      .eq("organization_id", orgId)
      .or(`created_at.gte.${since},stage_changed_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .range(i, i + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
    if (i + PAGE >= MAX) truncated = true;
  }

  // Loyiha filtri: only the leads of the chosen project.
  const mine = project ? rows.filter((l) => leadInProject(l, project)) : rows;
  const qleads: QLead[] = mine.map((l) => ({
    source: l.source,
    campaign: l.campaign,
    utm: l.utm,
    created_at: l.created_at,
    stage_changed_at: l.stage_changed_at,
    budget: l.budget,
    won: !!l.stage_id && won.has(l.stage_id),
    lost: !!l.stage_id && lost.has(l.stage_id),
    score: l.score,
    temperature: l.temperature && TEMPS.has(l.temperature) ? (l.temperature as Temperature) : null,
  }));
  const fleads: FLead[] = qleads.map((l) => ({
    source: l.source,
    created_at: l.created_at,
    stage_changed_at: l.stage_changed_at,
    budget: l.budget,
    won: l.won,
  }));

  const { data: pipelines } = await supabaseAdmin
    .from("pipelines")
    .select("name")
    .eq("organization_id", orgId);

  const fromDay = new Date(new Date(r.from).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const toDay = new Date(new Date(r.to).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const entriesQuery = (cols: string) =>
    supabaseAdmin
      .from("finance_entries")
      .select(cols)
      .eq("organization_id", orgId)
      .eq("category", "marketing")
      .gte("entry_date", fromDay)
      .lt("entry_date", toDay)
      .order("entry_date", { ascending: false })
      .limit(5000);
  type EntryRow = {
    id: string;
    entry_date: string;
    kind: string;
    category: string;
    source: string | null;
    amount: number;
    note: string | null;
    project_id?: string | null;
  };
  let { data: entryData, error } = await entriesQuery(
    "id, entry_date, kind, category, source, amount, note, project_id",
  );
  // Before migration 20270109000000 there is no project_id.
  if (error && /project_id/.test(error.message)) {
    ({ data: entryData, error } = await entriesQuery(
      "id, entry_date, kind, category, source, amount, note",
    ));
  }
  const entryRows = ((entryData ?? []) as unknown as EntryRow[]).filter(
    (e) => !project || e.project_id === project.id,
  );
  const spend: FinEntry[] = error
    ? []
    : entryRows.map(({ project_id: _p, ...e }) => ({
        ...e,
        kind: e.kind === "income" ? "income" : "expense",
        amount: Number(e.amount) || 0,
      }));

  // Meta reklama: synced campaign spend (so'm) joins the spend, and each
  // campaign is matched with the CRM's leads of the same campaign name.
  const { data: adRows } = await supabaseAdmin
    .from("marketing_ad_spend")
    .select("day, campaign_id, campaign_name, spend, currency, impressions, clicks, leads")
    .eq("organization_id", orgId)
    .gte("day", fromDay)
    .lt("day", toDay)
    .limit(20_000);
  const projectCampaigns = project ? new Set(project.utm_campaigns.map(normCampaign)) : null;
  const ads = (adRows ?? [])
    .map((x) => ({ ...x, spend: Number(x.spend) || 0 }))
    .filter((x) => !projectCampaigns || projectCampaigns.has(normCampaign(x.campaign_name)));
  for (const x of ads) {
    spend.push({
      id: `meta-${x.day}-${x.campaign_id}`,
      entry_date: x.day,
      kind: "expense",
      category: "marketing",
      source: META_SOURCE,
      amount: toUzs(x.spend, x.currency),
      note: x.campaign_name,
    });
  }
  const crmByCampaign = new Map<string, number>();
  for (const l of qleads) {
    const c = campaignOf(l);
    if (!c || !(l.created_at >= r.from && l.created_at < r.to)) continue;
    crmByCampaign.set(normCampaign(c), (crmByCampaign.get(normCampaign(c)) ?? 0) + 1);
  }

  return {
    metaCampaigns: metaCampaigns(ads, crmByCampaign),
    sources: marketingBySource(fleads, spend, r),
    quality: qualityBy(qleads, r, (l) => l.source),
    campaigns: qualityBy(qleads, r, campaignOf),
    days: leadsByDay(qleads, r),
    months: monthlyRevenue(fleads, now),
    spend,
    sourceNames: [
      ...new Set(mine.map((l) => l.source?.trim()).filter((s): s is string => !!s)),
    ].sort((a, b) => a.localeCompare(b)),
    // For the project form: every funnel and campaign the company's leads use.
    funnelNames: [
      ...new Set(
        [
          ...(pipelines ?? []).map((p) => p.name?.trim()),
          ...rows.map((l) => l.funnel?.trim()),
        ].filter((s): s is string => !!s),
      ),
    ].sort((a, b) => a.localeCompare(b)),
    campaignNames: [
      ...new Set(rows.map((l) => campaignOf(l)).filter((s): s is string => !!s)),
    ].sort((a, b) => a.localeCompare(b)),
    truncated,
  };
}
