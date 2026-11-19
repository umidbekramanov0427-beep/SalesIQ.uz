// Server-only. Gathers what the AI tahlilchi's figures are worked out from,
// for one company and period (and optionally one project or campaign):
// the period's leads with their phone, calls (picked up or not), whether
// they watched the webinar, their qualification, prepayment / full payment
// and the money really received; spend (Meta campaigns + spend typed into
// Marketing -> Reklama); the period's webinars (peak, drop, the stage that
// lost most); the channels' subscribers. Always filtered by organization_id.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toUzs } from "@/lib/meta-ads";
import { leadInProject } from "@/lib/marketing-projects";
import { stageValueOf } from "@/lib/stage-value";
import { combineSamples, isEventKind, peaks, stageLosses } from "@/lib/webinar-timeline";
import { eventLabel } from "@/lib/marketing-bot/logic";
import {
  campaignKey,
  computeMetrics,
  type Metrics,
  type MetricsInput,
  type MLead,
  type MSpend,
  type MWebinar,
} from "@/lib/marketing-ai/metrics";
import type { NotQualReason } from "@/lib/marketing-ai/qual";

const PAGE = 1000;
const MAX = 20_000;

export type Scope = {
  from: string;
  to: string;
  projectId?: string | null;
  campaign?: string | null;
  webinarId?: string | null;
};

async function inChunks<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

export async function gatherMetrics(orgId: string, scope: Scope): Promise<Metrics> {
  return computeMetrics(await gatherInputs(orgId, scope));
}

/** The raw inputs (leads, spend, webinars, channels) of one scope. */
export async function gatherInputs(orgId: string, scope: Scope): Promise<MetricsInput> {
  const { from, to } = scope;
  const project = scope.projectId
    ? (
        await supabaseAdmin
          .from("marketing_projects")
          .select("id, funnels, utm_campaigns")
          .eq("organization_id", orgId)
          .eq("id", scope.projectId)
          .maybeSingle()
      ).data
    : null;

  // 1. Leads of the period (a cohort).
  type Row = {
    id: string;
    created_at: string;
    source: string | null;
    campaign: string | null;
    utm: unknown;
    funnel: string | null;
    stage_id: string | null;
    budget: number | null;
    paid_amount?: number | null;
    contact_id: string | null;
    webinar_watched?: boolean | null;
    qual_status?: string | null;
    not_qual_reason?: string | null;
    webinar_id?: string | null;
  };
  const rows: Row[] = [];
  let withQual = true;
  for (let i = 0; i < MAX; i += PAGE) {
    const cols =
      "id, created_at, source, campaign, utm, funnel, stage_id, budget, paid_amount, contact_id";
    type Res = { data: Row[] | null; error: { message: string } | null };
    const page = (select: string) =>
      supabaseAdmin
        .from("leads")
        .select(select)
        .eq("organization_id", orgId)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at")
        .range(i, i + PAGE - 1) as unknown as PromiseLike<Res>;
    let res = await page(
      withQual ? `${cols}, webinar_watched, qual_status, not_qual_reason, webinar_id` : cols,
    );
    if (res.error && withQual) {
      withQual = false; // before migration 20270128
      res = await page(cols);
    }
    if (res.error || !res.data) break;
    rows.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  let leads = project ? rows.filter((l) => leadInProject(l, project)) : rows;
  if (scope.campaign) leads = leads.filter((l) => campaignKey(l) === scope.campaign);
  if (scope.webinarId && withQual) leads = leads.filter((l) => l.webinar_id === scope.webinarId);
  const ids = leads.map((l) => l.id);

  // 2. Phones, calls, payments, stages reached.
  const contactIds = [...new Set(leads.map((l) => l.contact_id).filter((x): x is string => !!x))];
  const contacts = await inChunks(contactIds, 300, async (c) => {
    const { data } = await supabaseAdmin.from("contacts").select("id, phone").in("id", c);
    return data ?? [];
  });
  const phoneOf = new Map(contacts.map((c) => [c.id, c.phone as string | null]));
  const calls = await inChunks(ids, 300, async (c) => {
    const { data } = await supabaseAdmin
      .from("pbx_calls")
      .select("lead_id, duration_seconds, direction")
      .eq("organization_id", orgId)
      .in("lead_id", c);
    return data ?? [];
  });
  const callsOf = new Map<string, { answered: number; unanswered: number }>();
  for (const c of calls) {
    if (!c.lead_id) continue;
    const v = callsOf.get(c.lead_id) ?? { answered: 0, unanswered: 0 };
    if ((c.duration_seconds ?? 0) > 0) v.answered++;
    else if (c.direction === "outgoing") v.unanswered++;
    callsOf.set(c.lead_id, v);
  }
  const payments = await inChunks(ids, 300, async (c) => {
    const { data } = await supabaseAdmin
      .from("lead_payments")
      .select("lead_id, amount")
      .eq("organization_id", orgId)
      .in("lead_id", c);
    return data ?? [];
  });
  const paidOf = new Map<string, number>();
  for (const p of payments)
    paidOf.set(p.lead_id, (paidOf.get(p.lead_id) ?? 0) + Number(p.amount || 0));
  const { data: stageRows } = await supabaseAdmin
    .from("pipeline_stages")
    .select("*")
    .eq("organization_id", orgId);
  const valueOf = new Map(
    (stageRows ?? []).map((s) => [s.id, stageValueOf(s as Parameters<typeof stageValueOf>[0])]),
  );
  const events = await inChunks(ids, 300, async (c) => {
    const { data } = await supabaseAdmin
      .from("lead_stage_events")
      .select("lead_id, stage_id")
      .eq("organization_id", orgId)
      .in("lead_id", c);
    return data ?? [];
  });
  const reached = new Map<string, Set<string>>();
  for (const e of events) {
    const v = valueOf.get(e.stage_id);
    if (!v) continue;
    reached.set(e.lead_id, (reached.get(e.lead_id) ?? new Set()).add(v));
  }

  const mleads: MLead[] = leads.map((l) => {
    const r = reached.get(l.id) ?? new Set<string>();
    const cur = l.stage_id ? valueOf.get(l.stage_id) : undefined;
    if (cur) r.add(cur);
    const paid = paidOf.get(l.id) ?? Number(l.paid_amount ?? 0);
    const full = r.has("sale") || (!!l.budget && l.budget > 0 && paid >= l.budget);
    const c = callsOf.get(l.id) ?? { answered: 0, unanswered: 0 };
    return {
      createdAt: l.created_at,
      campaign: l.campaign,
      source: l.source,
      phone: l.contact_id ? (phoneOf.get(l.contact_id) ?? null) : null,
      answered: c.answered,
      unanswered: c.unanswered,
      watched: l.webinar_watched ?? null,
      qualStatus:
        l.qual_status === "qualified" || l.qual_status === "not_qualified" ? l.qual_status : null,
      notQualReason: (l.not_qual_reason as NotQualReason | null) ?? null,
      advance: full || paid > 0 || r.has("advance"),
      full,
      paid,
    };
  });

  // 3. Spend in the period.
  const fromDay = from.slice(0, 10);
  const toDay = to.slice(0, 10);
  const [{ data: meta, error: metaErr }, { data: fin }] = await Promise.all([
    supabaseAdmin
      .from("marketing_ad_spend")
      .select("day, campaign_name, spend, currency")
      .eq("organization_id", orgId)
      .gte("day", fromDay)
      .lt("day", toDay),
    supabaseAdmin
      .from("finance_entries")
      .select("entry_date, source, amount, project_id")
      .eq("organization_id", orgId)
      .eq("category", "marketing")
      .gte("entry_date", fromDay)
      .lt("entry_date", toDay),
  ]);
  const spend: MSpend[] = [
    ...(metaErr ? [] : (meta ?? [])).map((s) => ({
      day: s.day,
      campaign: s.campaign_name || null,
      source: "Meta",
      amount: toUzs(Number(s.spend || 0), s.currency || "USD"),
    })),
    ...(fin ?? [])
      .filter((e) => !scope.projectId || e.project_id === scope.projectId)
      .map((e) => ({
        day: e.entry_date,
        campaign: null,
        source: e.source,
        amount: Number(e.amount || 0),
      })),
  ].filter((s) => !scope.campaign || (s.campaign ?? s.source) === scope.campaign);
  const { count: metaAccounts } = await supabaseAdmin
    .from("marketing_meta_accounts")
    .select("organization_id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const spendKnown = spend.length > 0 || (metaAccounts ?? 0) > 0;

  // 4. Webinars of the period.
  let wq = supabaseAdmin
    .from("marketing_webinars")
    .select("id, title, starts_at, registrations, project_id")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at")
    .limit(40);
  if (scope.projectId) wq = wq.eq("project_id", scope.projectId);
  if (scope.webinarId) wq = wq.eq("id", scope.webinarId);
  const { data: wrows } = await wq;
  const webinars: MWebinar[] = [];
  for (const w of wrows ?? []) {
    const [{ data: samples }, { data: marks }] = await Promise.all([
      supabaseAdmin
        .from("marketing_webinar_samples")
        .select("at, viewers, source")
        .eq("webinar_id", w.id)
        .order("at")
        .limit(5000),
      supabaseAdmin.from("marketing_webinar_marks").select("*").eq("webinar_id", w.id),
    ]);
    const points = combineSamples(samples ?? []);
    const evs = (marks ?? [])
      .filter((m) => isEventKind(m.kind))
      .map((m) => ({
        id: m.id,
        at: m.at,
        kind: m.kind as Parameters<typeof eventLabel>[0],
        seq: (m as { seq?: number | null }).seq ?? null,
        label: m.label,
        confirmed: (m as { confirmed?: boolean }).confirmed ?? true,
      }));
    const pk = peaks(points).total;
    const last = points.at(-1)?.total ?? null;
    const { worst } = stageLosses(points, evs);
    webinars.push({
      id: w.id,
      title: w.title,
      startsAt: w.starts_at,
      peak: pk?.viewers ?? null,
      avg: points.length
        ? Math.round(points.reduce((a, p) => a + p.total, 0) / points.length)
        : null,
      registrations: w.registrations,
      dropFromPeak: pk && last != null && pk.viewers > 0 ? (pk.viewers - last) / pk.viewers : null,
      worst:
        worst && worst.change != null && worst.change < 0
          ? {
              label: `${eventLabel(worst.from.kind, worst.from.seq)} → ${worst.to ? eventLabel(worst.to.kind, worst.to.seq) : "efir oxiri"}`,
              change: worst.change,
              pct: worst.pct,
            }
          : null,
    });
  }

  // 5. Channels: subscribers at the start and the end of the period.
  let cq = supabaseAdmin
    .from("marketing_channels")
    .select("id, title")
    .eq("organization_id", orgId)
    .is("archived_at", null);
  if (scope.projectId) cq = cq.eq("project_id", scope.projectId);
  const { data: chans } = await cq;
  const channels = [];
  for (const c of chans ?? []) {
    const { data: days } = await supabaseAdmin
      .from("marketing_channel_days")
      .select("day, members")
      .eq("channel_id", c.id)
      .gte("day", fromDay)
      .lt("day", toDay)
      .order("day");
    channels.push({
      title: c.title,
      start: days?.[0]?.members ?? null,
      end: days?.at(-1)?.members ?? null,
    });
  }

  return { from, to, leads: mleads, spend, spendKnown, webinars, channels };
}

/** The same-length period right before this one. */
export function previousScope(s: Scope): Scope {
  const len = Date.parse(s.to) - Date.parse(s.from);
  return { ...s, from: new Date(Date.parse(s.from) - len).toISOString(), to: s.from };
}
