// The company's own Telegram bot (Integratsiyalar -> Telegram bot) and the
// shared trial bot's days left, from /org-bot.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type OrgBotState = {
  ready: boolean;
  bot: {
    username: string;
    link: string;
    defaultSalesbotId: string | null;
    /** «Yangi obunachiga lid ochilsin» (on until migration 20270210 says otherwise). */
    newSubscriberLead?: boolean;
    connectedAt: string;
    webhookOk: boolean;
    webhookError: string | null;
  } | null;
  sharedBot: { until: string | null; daysLeft: number | null; username: string | null };
};

export function useOrgBot(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_bot", user?.organizationId],
    enabled: enabled && !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<OrgBotState | null> => {
      const res = await apiFetch("/org-bot");
      if (!res.ok) return null;
      return (await res.json()) as OrgBotState;
    },
  });
}

export function useOrgBotAction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      body:
        | { action: "connect"; token: string }
        | { action: "default"; salesbotId: string | null }
        | { action: "newSubscriberLead"; on: boolean }
        | { action: "reconnect" }
        | { action: "disconnect" },
    ) => {
      const res = await apiFetch("/org-bot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; username?: string };
      if (!res.ok) throw new Error(j.error || "Xatolik");
      return j;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org_bot", user?.organizationId] }),
  });
}
