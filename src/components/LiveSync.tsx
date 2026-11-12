import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Live updates without refreshing: the browser listens (Supabase Realtime,
// RLS still decides which rows reach whom) to the company's tables the
// pages show -- leads, tasks, payments, refunds, reminders, attendance,
// fines, finance, calls, banners, the marketing panel's channels and
// webinars -- and on any change redraws whatever is on screen: every card,
// counter, list and chart refetches its numbers. Bursts are merged (one
// refresh at most every few seconds); a tab coming back to the front
// catches up, and a slow safety refresh covers a dropped socket.

const LIVE_TABLES = [
  "leads",
  "tasks",
  "lead_stage_events",
  "lead_refunds",
  "lead_payments",
  "reminders",
  "work_sessions",
  "fines",
  "finance_entries",
  "call_logs",
  "amocrm_calls",
  "pbx_calls",
  "announcements",
  "marketing_channels",
  "marketing_channel_days",
  "marketing_webinars",
  "marketing_webinar_samples",
  "marketing_webinar_marks",
] as const;

/** Queries that never follow data changes (settings, translations, the user's own profile). */
const STATIC_KEYS = new Set(["profile", "i18n", "org_access", "sidebar_config"]);

const MIN_GAP_MS = 3_000;
const SAFETY_REFRESH_MS = 90_000;

export function LiveSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = user?.role === "platform_owner" ? null : (user?.organizationId ?? null);

  useEffect(() => {
    if (!orgId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const refresh = () => {
      last = Date.now();
      void qc.invalidateQueries({
        refetchType: "active",
        predicate: (q) => !STATIC_KEYS.has(String(q.queryKey[0])),
      });
    };
    const soon = () => {
      if (timer) return;
      const wait = Math.max(400, MIN_GAP_MS - (Date.now() - last));
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, wait);
    };

    let channel = supabase.channel(`live-sync-${orgId}`);
    for (const table of LIVE_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `organization_id=eq.${orgId}` },
        soon,
      );
    }
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > MIN_GAP_MS) soon();
    };
    document.addEventListener("visibilitychange", onVisible);
    const safety = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - last > SAFETY_REFRESH_MS) soon();
    }, SAFETY_REFRESH_MS);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(safety);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  return null;
}
