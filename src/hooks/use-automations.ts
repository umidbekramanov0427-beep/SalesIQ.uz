import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import type { BotStep, MessageChannel } from "@/lib/automation-types";

type Tables = Database["public"]["Tables"];

export type SalesbotRow = Omit<Tables["salesbots"]["Row"], "steps" | "kind" | "channel"> & {
  steps: BotStep[];
  kind: "builtin" | "external";
  channel: MessageChannel;
};
export type SalesbotRunRow = Tables["salesbot_runs"]["Row"];
export type OutboxRow = Tables["automation_outbox"]["Row"];

export function useSalesbots() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["salesbots", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<SalesbotRow[]> => {
      const { data, error } = await supabase
        .from("salesbots")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((b) => ({
        ...b,
        steps: (b.steps as unknown as BotStep[]) ?? [],
        kind: b.kind as SalesbotRow["kind"],
        channel: b.channel as MessageChannel,
      }));
    },
  });
}

export type SalesbotInput = {
  name: string;
  description?: string | null;
  kind: "builtin" | "external";
  channel: MessageChannel;
  steps: BotStep[];
  external_url?: string | null;
  external_secret?: string | null;
  enabled?: boolean;
};

export function useSaveSalesbot() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SalesbotInput }) => {
      const row = { ...input, steps: input.steps as unknown as Json };
      if (id) {
        const { error } = await supabase.from("salesbots").update(row).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("salesbots")
        .insert({
          ...row,
          organization_id: user!.organizationId!,
          created_by: user!.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["salesbots"] }),
  });
}

export function useDeleteSalesbot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salesbots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["salesbots"] }),
  });
}

export function useSalesbotRuns(botId: string | null | undefined) {
  return useQuery({
    queryKey: ["salesbot_runs", botId],
    enabled: !!botId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<SalesbotRunRow[]> => {
      const { data, error } = await supabase
        .from("salesbot_runs")
        .select("*")
        .eq("bot_id", botId!)
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStartSalesbot() {
  return useMutation({
    mutationFn: async ({ botId, leadId }: { botId: string; leadId: string }) => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/salesbots/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ botId, leadId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; runId?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return json;
    },
  });
}

/** Recent outbox items (sent messages / webhooks) for one rule -- shown in its history. */
export function useRuleOutbox(ruleId: string | null | undefined) {
  return useQuery({
    queryKey: ["automation_outbox", ruleId],
    enabled: !!ruleId,
    queryFn: async (): Promise<OutboxRow[]> => {
      const { data, error } = await supabase
        .from("automation_outbox")
        .select("*")
        .eq("rule_id", ruleId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type RuleDraft = {
  name: string;
  funnel: string | null;
  trigger_type: string;
  trigger_stage_id: string | null;
  trigger_source: string | null;
  trigger_tag: string | null;
  trigger_channel: string | null;
  trigger_after_minutes: number | null;
  delay_minutes: number;
  condition_field: string | null;
  condition_operator: string | null;
  condition_value: string | null;
  actions: unknown[];
  enabled: boolean;
};

/** Creates or updates one digital-pipeline rule with every trigger column. */
export function useSaveAutomationRule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: RuleDraft }) => {
      const row = { ...draft, actions: draft.actions as Json };
      if (id) {
        const { error } = await supabase.from("automation_rules").update(row).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("automation_rules").insert({
        ...row,
        organization_id: user!.organizationId!,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automation_rules"] }),
  });
}
