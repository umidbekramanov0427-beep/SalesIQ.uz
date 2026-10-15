// Automatic follow-up settings and what it has done.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Tables } from "./core";

export type FollowupSettingsRow = Tables["org_followup_settings"]["Row"];

const missing = (e: { code?: string; message?: string }) =>
  e.code === "42P01" ||
  e.code === "PGRST205" ||
  /schema cache|does not exist/.test(e.message ?? "");

export function useFollowupSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_followup_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ ready: boolean; settings: FollowupSettingsRow | null }> => {
      const { data, error } = await supabase
        .from("org_followup_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) {
        if (missing(error)) return { ready: false, settings: null };
        throw error;
      }
      return { ready: true, settings: data };
    },
  });
}

export function useSaveFollowupSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Pick<
        FollowupSettingsRow,
        | "enabled"
        | "after_hours"
        | "max_attempts"
        | "message"
        | "second_message"
        | "work_start"
        | "work_end"
      >,
    ) => {
      const { error } = await supabase.from("org_followup_settings").upsert(
        {
          ...patch,
          organization_id: user!.organizationId!,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
      if (error) throw new Error(missing(error) ? "MIGRATION_PENDING" : error.message);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_followup_settings", user?.organizationId] }),
  });
}

export type FollowupLogRow = {
  id: string;
  lead_id: string;
  attempt: number;
  message: string;
  sent_at: string;
  replied_at: string | null;
  leads: { name: string | null } | null;
};

/** Follow-ups of the last 30 days: counts and the latest ones. */
export function useFollowupStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lead_followups_stats", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("lead_followups")
        .select("id, lead_id, attempt, message, sent_at, replied_at, leads(name)")
        .eq("organization_id", user!.organizationId!)
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(1000);
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      const rows = (data ?? []) as unknown as FollowupLogRow[];
      const delivered = rows.filter((r) => !r.message.startsWith("[yuborilmadi]"));
      const replied = delivered.filter((r) => r.replied_at).length;
      return {
        sent: delivered.length,
        replied,
        rate: delivered.length ? Math.round((replied / delivered.length) * 100) : null,
        recent: rows.slice(0, 15),
      };
    },
  });
}
