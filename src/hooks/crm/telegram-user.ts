// A salesperson's work Telegram account (Sozlamalar -> «Telegram akkauntim»,
// src/lib/telegram-user/): its state and connecting it, a lead's chat on
// such an account, and replying through it from the lead card.
import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import type { BulkFileInput } from "./integrations";

export type WorkTelegramState = {
  configured: boolean;
  ready: boolean;
  account: {
    name: string | null;
    username: string | null;
    phone: string | null;
    status: "ok" | "error";
    lastError: string | null;
    connectedAt: string;
    lastEventAt: string | null;
  } | null;
};

export function useWorkTelegramAccount() {
  return useQuery({
    queryKey: ["work_telegram_account"],
    staleTime: 60_000,
    queryFn: async (): Promise<WorkTelegramState> => {
      const res = await apiFetch("/telegram/user-account");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      return json as WorkTelegramState;
    },
  });
}

export type WorkTelegramAction =
  | { action: "start"; phone: string }
  | { action: "resend"; loginId: string }
  | { action: "code"; loginId: string; code: string; password?: string; phone?: string }
  | { action: "qr-start" }
  | { action: "qr-poll"; loginId: string }
  | { action: "disconnect" };

export function useWorkTelegramAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WorkTelegramAction): Promise<Record<string, unknown>> => {
      const res = await apiFetch("/telegram/user-account", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return json;
    },
    onSuccess: (data, body) => {
      const done =
        body.action === "disconnect" ||
        (body.action === "code" && data["needPassword"] !== true) ||
        (body.action === "qr-poll" && data["status"] === "done");
      if (done) void qc.invalidateQueries({ queryKey: ["work_telegram_account"] });
    },
  });
}

export type LeadWorkTelegramLink = {
  account_tg_user_id: number;
  peer_id: number;
  username: string | null;
  name: string | null;
  phone: string | null;
};

/** The lead's chat on a salesperson's work Telegram account, or null (also before the migration). */
export function useLeadWorkTelegramLink(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_work_telegram_link", leadId],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async (): Promise<LeadWorkTelegramLink | null> => {
      const { data, error } = await supabase
        .from("lead_telegram_user_links")
        .select("account_tg_user_id, peer_id, username, name, phone")
        .eq("lead_id", leadId!)
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}

export function useSendWorkTelegramMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      text,
    }: {
      leadId: string;
      text: string;
      files?: BulkFileInput[];
    }) => {
      const res = await apiFetch("/telegram/user-send", {
        method: "POST",
        body: JSON.stringify({ leadId, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send the message");
      return json;
    },
    onSuccess: (_d, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_telegram_messages", leadId] }),
  });
}

/** Lead card → «Telegram'da topish»: the caller's work account finds the client by phone. */
export function useFindLeadOnTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      leadId: string,
    ): Promise<{ username: string | null; name: string | null }> => {
      const res = await apiFetch("/telegram/user-link", {
        method: "POST",
        body: JSON.stringify({ leadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return json;
    },
    onSuccess: (_d, leadId) =>
      void qc.invalidateQueries({ queryKey: ["lead_work_telegram_link", leadId] }),
  });
}

export type TeamWorkAccount = {
  profileId: string;
  name: string;
  role: string | null;
  account: {
    name: string | null;
    username: string | null;
    phone: string | null;
    status: "ok" | "error";
    lastError: string | null;
    connectedAt: string;
    lastEventAt: string | null;
    chats: number;
  } | null;
};

export type WorkTeamState = {
  configured: boolean;
  canEdit: boolean;
  policy: { enabled: boolean; roles: string[]; createLeads: boolean };
  team: TeamWorkAccount[];
};

/** Integratsiyalar → «Telegram (sotuvchi akkaunti)»: the rules and everyone's account (admins, ROPs). */
export function useWorkTelegramTeam(enabled = true) {
  return useQuery({
    queryKey: ["work_telegram_team"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<WorkTeamState> => {
      const res = await apiFetch("/telegram/user-accounts");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      return json as WorkTeamState;
    },
  });
}

export function useWorkTelegramTeamAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body:
        | { action: "disconnect"; profileId: string }
        | { action: "policy"; policy: WorkTeamState["policy"] },
    ) => {
      const res = await apiFetch("/telegram/user-accounts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["work_telegram_team"] });
      void qc.invalidateQueries({ queryKey: ["work_telegram_account"] });
    },
  });
}

/* ---- Work groups (Inbox → «Guruhlar») ----------------------------------- */

export type WorkGroup = {
  id: string;
  title: string;
  profile_id: string;
  last_message_at: string | null;
  last_text: string | null;
};

export type WorkGroupMessage = {
  id: string;
  group_id: string;
  sender_tg_id: number | null;
  sender_name: string | null;
  text: string;
  is_out: boolean;
  sent_by: string | null;
  created_at: string;
};

/** The groups the viewer may see (own; all of the company's for admins / ROPs). Live. */
export function useWorkGroups() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = user?.organizationId ?? null;
  const uid = useId();
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`work-groups-${orgId}-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telegram_user_group_messages",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          void qc.invalidateQueries({ queryKey: ["work_groups", orgId] });
          const groupId = (payload.new as { group_id?: string } | null)?.group_id;
          if (groupId) void qc.invalidateQueries({ queryKey: ["work_group_messages", groupId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, qc, uid]);
  return useQuery({
    queryKey: ["work_groups", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WorkGroup[]> => {
      const { data, error } = await supabase
        .from("telegram_user_groups")
        .select("id, title, profile_id, last_message_at, last_text")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) return []; // before the groups migration
      return data ?? [];
    },
  });
}

/** A group's latest 300 messages, oldest first. */
export function useWorkGroupMessages(groupId: string | null, limit = 300) {
  return useQuery({
    queryKey: ["work_group_messages", groupId, limit],
    enabled: !!groupId,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<WorkGroupMessage[]> => {
      const { data, error } = await supabase
        .from("telegram_user_group_messages")
        .select("id, group_id, sender_tg_id, sender_name, text, is_out, sent_by, created_at")
        .eq("group_id", groupId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return [];
      return (data ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  });
}

export type WorkGroupChoice = {
  id: number;
  title: string;
  members: number | null;
  picked: boolean;
};

/** The viewer's own Telegram groups (live from Telegram), each marked picked or not. */
export function useWorkGroupChoices(enabled: boolean) {
  return useQuery({
    queryKey: ["work_group_choices"],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<WorkGroupChoice[]> => {
      const res = await apiFetch("/telegram/user-groups");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return (json as { groups: WorkGroupChoice[] }).groups;
    },
  });
}

export function usePickWorkGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groups: { id: number; title: string }[]) => {
      const res = await apiFetch("/telegram/user-groups", {
        method: "POST",
        body: JSON.stringify({ action: "pick", groups }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["work_group_choices"] });
      void qc.invalidateQueries({ queryKey: ["work_groups"] });
    },
  });
}

/**
 * Brings a group's chat in as Telegram shows it: the latest messages, or
 * (`older`) the ones before the oldest kept. Resolves with how many came and
 * whether there are more.
 */
export function useLoadGroupHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      older = false,
    }: {
      groupId: string;
      older?: boolean;
    }): Promise<{ added: number; more: boolean }> => {
      const res = await apiFetch("/telegram/user-groups", {
        method: "POST",
        body: JSON.stringify({ action: "history", groupId, older }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return json;
    },
    onSuccess: (_d, { groupId }) => {
      void qc.invalidateQueries({ queryKey: ["work_group_messages", groupId] });
      void qc.invalidateQueries({ queryKey: ["work_groups"] });
    },
  });
}

export function useSendWorkGroupMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, text }: { groupId: string; text: string }) => {
      const res = await apiFetch("/telegram/user-groups", {
        method: "POST",
        body: JSON.stringify({ action: "send", groupId, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xatolik");
      return json;
    },
    onSuccess: (_d, { groupId }) => {
      void qc.invalidateQueries({ queryKey: ["work_group_messages", groupId] });
      void qc.invalidateQueries({ queryKey: ["work_groups"] });
    },
  });
}
