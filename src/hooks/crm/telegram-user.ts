// A salesperson's work Telegram account (Sozlamalar -> «Telegram akkauntim»,
// src/lib/telegram-user/): its state and connecting it, a lead's chat on
// such an account, and replying through it from the lead card.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
