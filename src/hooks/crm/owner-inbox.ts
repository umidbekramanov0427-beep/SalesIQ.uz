// The owner's inbox by company (/platform/inbox-api): the Yordam page and
// the owner menu's "waiting" count share this one query.
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { CompanyThread } from "@/lib/owner-inbox";

export type OwnerInboxData = {
  ready: boolean;
  statesReady: boolean;
  threads: CompanyThread[];
  stats?: {
    waiting: number;
    avgResponseMs: number | null;
    answeredToday: number;
    questions: number;
  };
  owners?: { id: string; name: string }[];
  slaMinutes?: number | null;
};

export function useOwnerInbox(enabled = true) {
  return useQuery({
    queryKey: ["owner_inbox"],
    enabled,
    refetchInterval: 12_000,
    queryFn: async (): Promise<OwnerInboxData> => {
      const res = await apiFetch("/platform/inbox-api");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}
