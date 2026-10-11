// Profile window and notifications inbox.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { RESOURCE_PAGE_SIZE, fetchAllPages } from "./core";
import type { Tables, TaskRow } from "./core";
import { useNotificationsRaw, usePipelineStagesRaw, useProfilesRaw } from "./config";
import { byId, toTaskView, useVisibleOwnerIds } from "./crm-views";
import type { TaskView } from "./crm-views";
import { scopeByLead } from "./dashboard";
import { startOfDay } from "./lead-analytics";
import type { AuditLogRow } from "./content";

/* ------------------------------------------------------------------ */
/* Profile window: sign-ins, devices, own activity                     */
/* ------------------------------------------------------------------ */

export type LoginEventRow = Tables["user_login_events"]["Row"];

const DEVICE_KEY = "salesiq.deviceId";

// A stable id for this browser, so the sign-in list can group by device
// and mark "this device".
export function currentDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

// Once per browser session, tell the server this user is signed in here.
// It records the IP and place from the request; a failure (e.g. before
// the migration is applied) is ignored -- it only feeds the history list.
export function useRecordLoginEvent() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const key = `salesiq.loginEvent.${userId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/account/login-event", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: currentDeviceId() }),
      }).catch(() => undefined);
    })();
  }, [userId]);
}

export function useMyLoginEvents(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_login_events", user?.id],
    enabled: enabled && !!user?.id,
    queryFn: async (): Promise<LoginEventRow[]> => {
      const { data, error } = await supabase
        .from("user_login_events")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return [];
      return data ?? [];
    },
  });
}

export function useMyActivity(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_audit_activity", user?.id],
    enabled: enabled && !!user?.id,
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase.rpc("my_audit_activity", { p_limit: 150 });
      if (error) return [];
      return (data ?? []) as AuditLogRow[];
    },
  });
}

export function useLeadSearch(term: string, enabled = true) {
  const { user } = useAuth();
  const visibleOwnerIds = useVisibleOwnerIds();
  const q = term
    .trim()
    .replace(/[%,()]/g, " ")
    .trim();
  return useQuery({
    queryKey: ["leads", "search", user?.organizationId, q],
    enabled: enabled && !!user?.organizationId,
    queryFn: async () => {
      let query = supabase.from("leads").select("id, name, company_name, owner_id");
      if (q) query = query.or(`name.ilike.%${q}%,company_name.ilike.%${q}%`);
      if (visibleOwnerIds) query = query.in("owner_id", [...visibleOwnerIds]);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Open lead tasks due before the end of the coming week (overdue included),
 * for the dashboard widget -- filtered in the database instead of loading
 * every task and lead.
 */
export function useUpcomingLeadTasksView(funnel: string | null) {
  const { user } = useAuth();
  const profiles = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = visibleOwnerIds ? Array.from(visibleOwnerIds).sort().join(",") : null;
  const weekEnd = useMemo(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }, []);
  const tasks = useQuery({
    queryKey: ["tasks", "upcoming_lead", user?.organizationId, funnel, ownerKey, weekEnd],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*, lead:leads!inner(name, funnel, owner_id)")
        .neq("status", "Done")
        .lt("due_date", weekEnd);
      q = scopeByLead(q, funnel, null);
      if (visibleOwnerIds) q = q.in("assignee_id", Array.from(visibleOwnerIds));
      const { data, error } = await q.order("due_date", { ascending: true }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo<TaskView[]>(() => {
    const profilesById = byId(profiles.data);
    return (tasks.data ?? []).map(({ lead, ...t }) => toTaskView(t, profilesById, lead));
  }, [tasks.data, profiles.data]);
  return { rows, isLoading: tasks.isLoading || profiles.isLoading };
}

/** Hot leads not in a "Won" / "Lost" stage (dashboard AI insights card). */
export function useHotLeadCount(funnel: string | null) {
  const { user } = useAuth();
  const { data: stages } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = visibleOwnerIds ? Array.from(visibleOwnerIds).sort().join(",") : null;
  const hot = useQuery({
    queryKey: ["leads", "hot", user?.organizationId, funnel, ownerKey],
    enabled: !!user?.organizationId,
    queryFn: () =>
      fetchAllPages(async (offset) => {
        let q = supabase.from("leads").select("id, stage_id").eq("temperature", "Hot");
        if (funnel === "Direct Sales") q = q.or('funnel.is.null,funnel.in.("","Direct Sales")');
        else if (funnel) q = q.eq("funnel", funnel);
        if (visibleOwnerIds) q = q.in("owner_id", Array.from(visibleOwnerIds));
        const { data, error } = await q
          .order("id", { ascending: true })
          .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return data ?? [];
      }),
  });
  return useMemo(() => {
    const stagesById = byId(stages);
    return (hot.data ?? []).filter((l) => {
      const name = (l.stage_id ? stagesById.get(l.stage_id)?.name : undefined) ?? "New Lead";
      return name !== "Won" && name !== "Lost";
    }).length;
  }, [hot.data, stages]);
}

/** One lead's tasks, without loading every task and lead in the org. */
export function useLeadTasksView(
  lead: { id: string; name: string; funnel: string | null } | null | undefined,
) {
  const profiles = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const tasks = useQuery({
    queryKey: ["tasks", "lead", lead?.id],
    enabled: !!lead?.id,
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("lead_id", lead!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo<TaskView[]>(() => {
    const profilesById = byId(profiles.data);
    return (tasks.data ?? [])
      .filter((t) => !visibleOwnerIds || (t.assignee_id && visibleOwnerIds.has(t.assignee_id)))
      .map((t) => toTaskView(t, profilesById, lead ?? undefined));
  }, [tasks.data, profiles.data, visibleOwnerIds, lead]);
  return { rows, isLoading: tasks.isLoading || profiles.isLoading };
}

/* ------------------------------------------------------------------ */
/* View: Notifications (Inbox)                                         */
/* ------------------------------------------------------------------ */

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  unread: boolean;
  meta: string;
  link: string | null;
};

export function useNotificationsView() {
  const q = useNotificationsRaw();
  const rows = useMemo<NotificationView[]>(
    () =>
      (q.data ?? []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body ?? "",
        unread: !n.read,
        meta: timeAgo(n.created_at),
        link: n.link,
      })),
    [q.data],
  );
  return { rows, isLoading: q.isLoading, isError: q.isError };
}
