// Data for Bosh sahifa's overview (lib/home-overview.ts does the math):
// the leads, calls and tasks of the picked period and the one before it.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  computeHomeOverview,
  type OverviewCall,
  type OverviewLead,
  type OverviewTask,
  type Range,
} from "@/lib/home-overview";
import { RESOURCE_PAGE_SIZE, fetchAllPages } from "./core";
import { usePipelineStagesRaw } from "./config";
import { isSalesStageName } from "./dashboard";

const DIRECT = "Direct Sales";

type LeadRow = OverviewLead & { funnel: string | null; owner_id: string | null };
type TaskRow = OverviewTask & { assignee_id: string | null };
type CallRow = OverviewCall & { lead: { funnel: string | null; owner_id: string | null } | null };

export function useHomeOverview(
  range: Range | null,
  prevRange: Range | null,
  scope: { funnel: string | null; ownerIds: string[] | null },
) {
  const { user } = useAuth();
  const { data: stages } = usePipelineStagesRaw();
  const fromISO = prevRange?.from.toISOString() ?? null;
  const toISO = range?.to.toISOString() ?? null;
  const ownerKey = scope.ownerIds ? [...scope.ownerIds].sort().join(",") : null;

  const query = useQuery({
    queryKey: ["home-overview", user?.organizationId, fromISO, toISO, scope.funnel, ownerKey],
    enabled: !!user?.organizationId && !!fromISO && !!toISO,
    staleTime: 60_000,
    queryFn: async () => {
      const ownerOk = (o: string | null) => !scope.ownerIds || (!!o && scope.ownerIds.includes(o));
      const funnelOk = (f: string | null) => !scope.funnel || (f || DIRECT) === scope.funnel;

      // Leads created in the window, or sold in it (created earlier).
      const leadCols =
        "id, created_at, first_contact_at, stage_id, stage_changed_at, budget, funnel, owner_id";
      const leadPage =
        (filter: "created_at" | "stage_changed_at") =>
        async (from: number): Promise<LeadRow[]> => {
          const { data, error } = await supabase
            .from("leads")
            .select(leadCols)
            .gte(filter, fromISO!)
            .lt(filter, toISO!)
            .order("id")
            .range(from, from + RESOURCE_PAGE_SIZE - 1);
          if (error) throw error;
          return (data ?? []) as unknown as LeadRow[];
        };
      const [createdLeads, movedLeads, calls, tasks, openLeads] = await Promise.all([
        fetchAllPages(leadPage("created_at")),
        fetchAllPages(leadPage("stage_changed_at")),
        fetchAllPages(async (from): Promise<CallRow[]> => {
          const { data, error } = await supabase
            .from("amocrm_calls")
            .select("lead_id, occurred_at, connected, lead:leads(funnel, owner_id)")
            .gte("occurred_at", fromISO!)
            .lt("occurred_at", toISO!)
            .order("id")
            .range(from, from + RESOURCE_PAGE_SIZE - 1);
          if (error) throw error;
          return (data ?? []) as unknown as CallRow[];
        }),
        fetchAllPages(async (from): Promise<TaskRow[]> => {
          const { data, error } = await supabase
            .from("tasks")
            .select("lead_id, status, due_date, updated_at, assignee_id")
            .or(`status.neq.Done,due_date.gte.${fromISO}`)
            .order("id")
            .range(from, from + RESOURCE_PAGE_SIZE - 1);
          if (error) throw error;
          return (data ?? []) as TaskRow[];
        }),
        // Open leads (not won or lost) -- how many should have a task.
        (async () => {
          const closed = (stages ?? []).filter((s) => s.is_won || s.is_lost).map((s) => s.id);
          let q = supabase.from("leads").select("id", { count: "exact", head: true });
          if (closed.length) q = q.not("stage_id", "in", `(${closed.join(",")})`);
          if (scope.funnel === DIRECT) q = q.or(`funnel.is.null,funnel.eq.${DIRECT}`);
          else if (scope.funnel) q = q.eq("funnel", scope.funnel);
          if (scope.ownerIds) q = q.in("owner_id", scope.ownerIds);
          const { count } = await q;
          return count ?? 0;
        })(),
      ]);

      const leads = new Map<string, LeadRow>();
      for (const l of [...createdLeads, ...movedLeads]) {
        if (funnelOk(l.funnel) && ownerOk(l.owner_id)) leads.set(l.id, l);
      }
      return {
        leads: [...leads.values()],
        calls: calls.filter(
          (c) => !c.lead || (funnelOk(c.lead.funnel) && ownerOk(c.lead.owner_id)),
        ),
        tasks: tasks.filter((x) => !scope.ownerIds || ownerOk(x.assignee_id)),
        openLeads,
      };
    },
  });

  const data = query.data;
  const overview = useMemo(() => {
    if (!data || !range || !prevRange) return null;
    const byId = new Map((stages ?? []).map((s) => [s.id, s]));
    return computeHomeOverview({
      range,
      prevRange,
      leads: data.leads,
      calls: data.calls,
      tasks: data.tasks,
      openLeads: data.openLeads,
      isSale: (id) => !!id && isSalesStageName(byId.get(id)),
    });
  }, [data, range, prevRange, stages]);

  return { overview, isLoading: query.isLoading };
}

export type TodayTask = {
  id: string;
  title: string;
  due_date: string;
  lead_id: string | null;
  lead: { id: string; name: string; company_name: string } | null;
};

/** The signed-in person's open tasks due by the end of today, oldest first. */
export function useTodayTasks(limit = 6) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["home-today-tasks", user?.id, limit],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const base = () =>
        supabase
          .from("tasks")
          .select("id, title, due_date, lead_id, lead:leads(id, name, company_name)", {
            count: "exact",
          })
          .eq("assignee_id", user!.id)
          .neq("status", "Done")
          .lte("due_date", end.toISOString());
      const { data, error, count } = await base()
        .order("due_date", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return { tasks: (data ?? []) as unknown as TodayTask[], total: count ?? 0 };
    },
  });
}
