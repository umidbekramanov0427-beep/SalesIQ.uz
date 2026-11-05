// "Ish stoli" (the home page laid out like amoCRM's desktop): the numbers
// behind its funnel strip and widgets, for one period. Every query is
// org-scoped by RLS; `ownerIds` narrows it to one person ("Meniki") or to
// what a rep may see. Rows are capped -- the desk is a summary, not a report.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type DeskRange = { from: Date; to: Date };
export type DeskPerson = { ownerId: string | null; n: number; sum: number };

const CAP = 5000;
const DAY = 86_400_000;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function inChunks<T>(ids: string[], load: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 300) out.push(...(await load(ids.slice(i, i + 300))));
  return out;
}

const allowed = (ownerIds: Set<string> | null, id: string | null) =>
  !ownerIds || (!!id && ownerIds.has(id));

/** Per person: count and sum, biggest first. */
function byPerson(rows: { owner: string | null; sum: number }[]): DeskPerson[] {
  const m = new Map<string | null, DeskPerson>();
  for (const r of rows) {
    const cur = m.get(r.owner) ?? { ownerId: r.owner, n: 0, sum: 0 };
    cur.n += 1;
    cur.sum += r.sum;
    m.set(r.owner, cur);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.sum - a.sum);
}

/**
 * Stage entries in the period (lead_stage_events): per stage how many leads
 * came in, and the won ones per person with their budgets -- also for
 * yesterday, for the widgets' "kecha" figure.
 */
export function useDeskStageFlow(
  range: DeskRange,
  ownerIds: Set<string> | null,
  wonStageIds: Set<string>,
) {
  const { user } = useAuth();
  const yStart = new Date(startOfToday().getTime() - DAY);
  const from = new Date(Math.min(range.from.getTime(), yStart.getTime()));
  const to = new Date(Math.max(range.to.getTime(), startOfToday().getTime()));
  return useQuery({
    queryKey: ["desk", "flow", user?.organizationId, from.toISOString(), to.toISOString()],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_stage_events")
        .select("lead_id, stage_id, owner_id, entered_at")
        .gte("entered_at", from.toISOString())
        .lt("entered_at", to.toISOString())
        .order("entered_at", { ascending: false })
        .limit(CAP);
      if (error) throw error;
      const events = data ?? [];
      const wonLeadIds = [
        ...new Set(events.filter((e) => wonStageIds.has(e.stage_id)).map((e) => e.lead_id)),
      ];
      const leads = await inChunks(wonLeadIds, async (part) => {
        const { data: rows, error: e2 } = await supabase
          .from("leads")
          .select("id, budget, funnel")
          .in("id", part);
        if (e2) throw e2;
        return rows ?? [];
      });
      return { events, leads };
    },
    select: (d) => {
      const inRange = (at: string) => {
        const t = Date.parse(at);
        return t >= range.from.getTime() && t < range.to.getTime();
      };
      const yesterday = (at: string) => {
        const t = Date.parse(at);
        return t >= yStart.getTime() && t < startOfToday().getTime();
      };
      const lead = new Map(d.leads.map((l) => [l.id, l]));
      const events = d.events.filter((e) => allowed(ownerIds, e.owner_id));
      const entered = new Map<string, number>();
      for (const e of events)
        if (inRange(e.entered_at)) entered.set(e.stage_id, (entered.get(e.stage_id) ?? 0) + 1);
      const won = (pick: (at: string) => boolean, funnel: string | null) =>
        byPerson(
          events
            .filter((e) => wonStageIds.has(e.stage_id) && pick(e.entered_at))
            .filter((e) => !funnel || (lead.get(e.lead_id)?.funnel || "Direct Sales") === funnel)
            .map((e) => ({ owner: e.owner_id, sum: Number(lead.get(e.lead_id)?.budget ?? 0) })),
        );
      return { entered, won, inRange, yesterday };
    },
  });
}

/** Incoming calls in the period, per owner of the caller's lead. */
export function useDeskIncomingCalls(range: DeskRange, ownerIds: Set<string> | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "desk",
      "calls",
      user?.organizationId,
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pbx_calls")
        .select("lead_id, missed")
        .eq("direction", "incoming")
        .gte("created_at", range.from.toISOString())
        .lt("created_at", range.to.toISOString())
        .limit(CAP);
      if (error) throw error;
      const calls = data ?? [];
      const ids = [...new Set(calls.map((c) => c.lead_id).filter((x): x is string => !!x))];
      const owners = await inChunks(ids, async (part) => {
        const { data: rows, error: e2 } = await supabase
          .from("leads")
          .select("id, owner_id")
          .in("id", part);
        if (e2) throw e2;
        return rows ?? [];
      });
      return { calls, owners };
    },
    select: (d) => {
      const owner = new Map(d.owners.map((o) => [o.id, o.owner_id]));
      const rows = d.calls
        .map((c) => ({ owner: (c.lead_id && owner.get(c.lead_id)) || null, missed: c.missed }))
        .filter((c) => allowed(ownerIds, c.owner));
      return {
        people: byPerson(rows.map((r) => ({ owner: r.owner, sum: 0 }))),
        missed: rows.filter((r) => r.missed).length,
      };
    },
  });
}

/** Leads created in the period by source. */
export function useDeskSources(
  range: DeskRange,
  funnel: string | null,
  ownerIds: Set<string> | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "desk",
      "sources",
      user?.organizationId,
      funnel,
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("source, owner_id, budget")
        .gte("created_at", range.from.toISOString())
        .lt("created_at", range.to.toISOString())
        .limit(CAP);
      if (funnel) q = q.eq("funnel", funnel);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    select: (rows) => {
      const m = new Map<string, { label: string; n: number; sum: number }>();
      for (const r of rows) {
        if (!allowed(ownerIds, r.owner_id)) continue;
        const label = (r.source ?? "").trim() || "—";
        const cur = m.get(label) ?? { label, n: 0, sum: 0 };
        cur.n += 1;
        cur.sum += Number(r.budget ?? 0);
        m.set(label, cur);
      }
      return [...m.values()].sort((a, b) => b.n - a.n);
    },
  });
}

/** Loss reasons in the period (lead_loss_reasons RPC). */
export function useDeskLossReasons(
  range: DeskRange,
  funnel: string | null,
  ownerIds: Set<string> | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "desk",
      "loss",
      user?.organizationId,
      funnel,
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lead_loss_reasons", {
        p_funnel: funnel,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      if (error) throw error;
      return data ?? [];
    },
    select: (rows) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        if (!allowed(ownerIds, r.owner_id)) continue;
        m.set(r.reason, (m.get(r.reason) ?? 0) + Number(r.n));
      }
      return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
    },
  });
}

/** Yesterday's actions in lead cards (notes, calls, tasks...) per person. */
export function useDeskActivityYesterday(ownerIds: Set<string> | null) {
  const { user } = useAuth();
  const to = startOfToday();
  const from = new Date(to.getTime() - DAY);
  return useQuery({
    queryKey: ["desk", "activity", user?.organizationId, from.toISOString()],
    enabled: !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("created_by")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(CAP);
      if (error) throw error;
      return data ?? [];
    },
    select: (rows) =>
      byPerson(
        rows
          .filter((r) => !!r.created_by && allowed(ownerIds, r.created_by))
          .map((r) => ({ owner: r.created_by, sum: 0 })),
      ),
  });
}
