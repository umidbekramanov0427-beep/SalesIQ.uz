import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadFunnels, TZ_OFFSET_MIN, type Viewer } from "@/lib/analytics.server";
import {
  computeDesk,
  dayStart,
  deskHistory,
  type DeskCall,
  type DeskData,
  type DeskLead,
  type DeskMonth,
  type DeskRange,
  type DeskSale,
  type DeskStage,
} from "@/lib/desk";

// Ish stoli's rows: read with the service role, pinned to the caller's
// company and cut to the leads the caller may see (Huquqlar), then handed
// to computeDesk (lib/desk.ts).

const MAX_ROWS = 30_000;
const PAGE = 1000;

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_ROWS; i += PAGE) {
    const { data, error } = await page(i, i + PAGE - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, k) => xs.slice(k * n, k * n + n));

const revenueOf = (l: { expected_revenue: number | null; budget: number | null }) =>
  Number(l.expected_revenue) > 0 ? Number(l.expected_revenue) : Number(l.budget) || 0;

type SaleRow = {
  id: string;
  owner_id: string | null;
  contact_id: string | null;
  source: string | null;
  funnel: string | null;
  budget: number | null;
  expected_revenue: number | null;
  stage_changed_at: string | null;
};

/** The month (YYYY-MM-01) a moment falls in, in the company's zone. */
export function monthOfInstant(iso: string): string {
  const d = new Date(Date.parse(iso) + TZ_OFFSET_MIN * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function deskStages(v: Viewer) {
  const { funnels, stages } = await loadFunnels(v);
  const list: DeskStage[] = stages
    .filter((s) => !s.hidden)
    .map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      won: s.is_won || !!s.counts_as_won_override,
      lost: s.is_lost || !!s.counts_as_lost_override,
      funnel: s.pipeline_name ?? "",
    }));
  return { funnels, stages: list, wonIds: list.filter((s) => s.won).map((s) => s.id) };
}

async function wonLeads(v: Viewer, wonIds: string[], from: string, to: string) {
  if (!wonIds.length) return [] as SaleRow[];
  const owners = v.owners ? [...v.owners] : null;
  return readAll<SaleRow>((a, b) => {
    let q = supabaseAdmin
      .from("leads")
      .select(
        "id, owner_id, contact_id, source, funnel, budget, expected_revenue, stage_changed_at",
      )
      .eq("organization_id", v.orgId)
      .in("stage_id", wonIds)
      .gte("stage_changed_at", from)
      .lt("stage_changed_at", to);
    if (owners) q = q.in("owner_id", owners);
    return q.order("stage_changed_at").range(a, b);
  });
}

export async function gatherDesk(
  v: Viewer,
  range: DeskRange,
  prev: DeskRange,
  funnelParam: string | null,
  now = new Date(),
): Promise<DeskData> {
  const { funnels, stages, wonIds } = await deskStages(v);
  const funnel = funnelParam && funnels.includes(funnelParam) ? funnelParam : null;
  const owners = v.owners ? [...v.owners] : null;
  const yesterday = new Date(dayStart(now.getTime(), TZ_OFFSET_MIN) - 86_400_000).toISOString();
  const salesFrom = [prev.from, range.from, yesterday].sort()[0]!;
  const salesTo = [range.to, now.toISOString()].sort().reverse()[0]!;
  const leadsFrom = [prev.from, range.from].sort()[0]!;
  const planMonth = monthOfInstant(new Date(Date.parse(range.to) - 1).toISOString());
  const pm = new Date(`${planMonth}T00:00:00Z`);
  const planFrom = new Date(pm.getTime() - TZ_OFFSET_MIN * 60_000).toISOString();
  const planTo = new Date(
    Date.UTC(pm.getUTCFullYear(), pm.getUTCMonth() + 1, 1) - TZ_OFFSET_MIN * 60_000,
  ).toISOString();

  const [saleRows, planSales, leadRows, events, pbx, amoCalls, plans] = await Promise.all([
    wonLeads(v, wonIds, salesFrom, salesTo),
    wonLeads(v, wonIds, planFrom, planTo),
    readAll<DeskLead>((a, b) => {
      let q = supabaseAdmin
        .from("leads")
        .select("id, owner_id, stage_id, funnel, source, created_at")
        .eq("organization_id", v.orgId)
        .gte("created_at", leadsFrom)
        .lt("created_at", range.to);
      if (owners) q = q.in("owner_id", owners);
      return q.order("created_at").range(a, b);
    }),
    funnel
      ? readAll<{ lead_id: string; stage_id: string }>((a, b) =>
          supabaseAdmin
            .from("lead_stage_events")
            .select("lead_id, stage_id")
            .eq("organization_id", v.orgId)
            .in(
              "stage_id",
              stages.filter((s) => s.funnel === funnel).map((s) => s.id),
            )
            .gte("entered_at", range.from)
            .range(a, b),
        )
      : Promise.resolve([]),
    readAll<{ initiated_by: string | null; duration_seconds: number; created_at: string }>((a, b) =>
      supabaseAdmin
        .from("pbx_calls")
        .select("initiated_by, duration_seconds, created_at")
        .eq("organization_id", v.orgId)
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .range(a, b),
    ),
    readAll<{ created_by: string | null; duration_seconds: number; occurred_at: string }>((a, b) =>
      supabaseAdmin
        .from("amocrm_calls")
        .select("created_by, duration_seconds, occurred_at")
        .eq("organization_id", v.orgId)
        .is("pbx_call_id", null)
        .gte("occurred_at", range.from)
        .lt("occurred_at", range.to)
        .range(a, b),
    ),
    supabaseAdmin
      .from("sales_plans")
      .select("profile_id, target_amount")
      .eq("organization_id", v.orgId)
      .eq("month", planMonth)
      .then(
        (r) => (r.data ?? []) as { profile_id: string | null; target_amount: number }[],
        () => [],
      ),
  ]);

  const toSale = (r: SaleRow): DeskSale => ({
    id: r.id,
    owner_id: r.owner_id,
    contact_id: r.contact_id,
    source: r.source,
    funnel: r.funnel,
    revenue: revenueOf(r),
    at: r.stage_changed_at!,
  });
  const byId = new Map<string, DeskSale>();
  for (const r of [...saleRows, ...planSales]) if (r.stage_changed_at) byId.set(r.id, toSale(r));
  const sales = [...byId.values()];

  // Earlier wins of the sold contacts tell new clients from returning ones.
  const contactIds = [...new Set(sales.map((s) => s.contact_id).filter(Boolean))] as string[];
  const contactWins: { id: string; contact_id: string; at: string }[] = [];
  if (wonIds.length) {
    for (const part of chunks(contactIds, 200)) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, contact_id, stage_changed_at, created_at")
        .eq("organization_id", v.orgId)
        .in("stage_id", wonIds)
        .in("contact_id", part);
      for (const r of data ?? [])
        if (r.contact_id)
          contactWins.push({
            id: r.id,
            contact_id: r.contact_id,
            at: r.stage_changed_at ?? r.created_at,
          });
    }
  }

  const visibleCall = (id: string | null) => !v.owners || (!!id && v.owners.has(id));
  const calls: DeskCall[] = [
    ...pbx
      .filter((c) => visibleCall(c.initiated_by))
      .map((c) => ({ by: c.initiated_by, seconds: c.duration_seconds ?? 0, at: c.created_at })),
    ...amoCalls
      .filter((c) => visibleCall(c.created_by))
      .map((c) => ({ by: c.created_by, seconds: c.duration_seconds ?? 0, at: c.occurred_at })),
  ];

  return computeDesk({
    range,
    prev,
    now: now.toISOString(),
    tz: TZ_OFFSET_MIN,
    stages,
    funnels,
    funnel,
    people: v.people,
    sales,
    contactWins,
    leads: leadRows,
    stageEvents: events,
    calls,
    plans,
    planMonth,
  });
}

/** Tarix: the last 12 months up to the period's month. */
export async function gatherDeskHistory(
  v: Viewer,
  endMonth: string,
  funnelParam: string | null,
): Promise<DeskMonth[]> {
  const { funnels, wonIds } = await deskStages(v);
  const funnel = funnelParam && funnels.includes(funnelParam) ? funnelParam : null;
  const ok = (f: string | null) => (funnel ? (f ?? "") === funnel : funnels.includes(f ?? ""));
  const end = new Date(`${endMonth}T00:00:00Z`);
  const months = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
  const first = new Date(`${months[11]}T00:00:00Z`);
  const from = new Date(first.getTime() - TZ_OFFSET_MIN * 60_000).toISOString();
  const to = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1) - TZ_OFFSET_MIN * 60_000,
  ).toISOString();
  const owners = v.owners ? [...v.owners] : null;
  const [sales, leads, plans] = await Promise.all([
    wonLeads(v, wonIds, from, to),
    readAll<{ created_at: string; funnel: string | null }>((a, b) => {
      let q = supabaseAdmin
        .from("leads")
        .select("created_at, funnel")
        .eq("organization_id", v.orgId)
        .gte("created_at", from)
        .lt("created_at", to);
      if (owners) q = q.in("owner_id", owners);
      return q.order("created_at").range(a, b);
    }),
    supabaseAdmin
      .from("sales_plans")
      .select("month, profile_id, target_amount")
      .eq("organization_id", v.orgId)
      .in("month", months)
      .then(
        (r) =>
          (r.data ?? []) as { month: string; profile_id: string | null; target_amount: number }[],
        () => [],
      ),
  ]);
  return deskHistory({
    months,
    tz: TZ_OFFSET_MIN,
    sales: sales
      .filter((s) => ok(s.funnel) && s.stage_changed_at)
      .map((s) => ({ revenue: revenueOf(s), at: s.stage_changed_at! })),
    leads: leads.filter((l) => ok(l.funnel)),
    plans: owners ? plans.filter((p) => !p.profile_id || owners.includes(p.profile_id)) : plans,
  });
}
