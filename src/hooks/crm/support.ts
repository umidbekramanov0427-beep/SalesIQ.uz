// Live support (support_messages): a person's own thread with the SalesIQ
// team, and the platform owner's inbox of every thread.
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { mergeSupportMessage, type SupportMessage } from "@/lib/support";

const isMissing = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /schema cache|does not exist/.test(error.message ?? "");

/**
 * The signed-in person's support thread, oldest first; null until the
 * table exists. New messages are pushed live (useSupportRealtime); the
 * slow poll only covers a dropped connection.
 */
export function useMySupportMessages(open: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["support_messages", user?.id],
    enabled: !!user && user.role !== "platform_owner",
    refetchInterval: open ? 20_000 : 120_000,
    queryFn: async (): Promise<SupportMessage[] | null> => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, direction, text, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        if (isMissing(error)) return null;
        throw error;
      }
      return ((data ?? []) as SupportMessage[]).reverse();
    },
  });
}

/**
 * Pushes the person's new support messages (an answer, or a question sent
 * from another tab or Telegram) into the cache the moment they're saved.
 * Mounted once, by the assistant button.
 */
export function useSupportRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user && user.role !== "platform_owner" ? user.id : null;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`support-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Partial<SupportMessage> | undefined;
          if (!row?.id || !row.created_at || !row.text) return;
          const msg: SupportMessage = {
            id: row.id,
            direction: row.direction === "out" ? "out" : "in",
            text: row.text,
            created_at: row.created_at,
          };
          qc.setQueryData<SupportMessage[] | null>(["support_messages", userId], (old) =>
            mergeSupportMessage(old, msg),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

let pendingSeq = 0;

/** Sends a question; it shows on screen at once and is swapped for the saved one. */
export function useSendSupportMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["support_messages", user?.id];
  return useMutation({
    onMutate: (input: { text: string; page: string }) => {
      const placeholder: SupportMessage = {
        id: `pending-${++pendingSeq}`,
        direction: "in",
        text: input.text,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<SupportMessage[] | null>(key, (old) => mergeSupportMessage(old, placeholder));
      return { placeholderId: placeholder.id };
    },
    onError: (_err, _input, ctx) => {
      qc.setQueryData<SupportMessage[] | null>(key, (old) =>
        (old ?? []).filter((m) => m.id !== ctx?.placeholderId),
      );
    },
    mutationFn: async (input: { text: string; page: string }): Promise<SupportMessage> => {
      const res = await apiFetch("/support/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "SEND_FAILED");
      return json.message as SupportMessage;
    },
    onSuccess: (message, _input, ctx) => {
      qc.setQueryData<SupportMessage[] | null>(key, (old) =>
        mergeSupportMessage(old, message, ctx?.placeholderId),
      );
    },
  });
}

const seenKey = (userId: string) => `salesiq.support.seen.${userId}`;

/**
 * Whether the support team answered after the person last looked, kept
 * per device. `markSeen` is called while the Operator tab is on screen.
 */
export function useSupportUnread(messages: SupportMessage[] | null | undefined) {
  const { user } = useAuth();
  const [seen, setSeen] = useState<string>("");
  useEffect(() => {
    if (!user) return;
    try {
      setSeen(window.localStorage.getItem(seenKey(user.id)) ?? "");
    } catch {
      setSeen("");
    }
  }, [user]);
  const lastAnswer = [...(messages ?? [])].reverse().find((m) => m.direction === "out");
  const unread = !!lastAnswer && lastAnswer.created_at > seen;
  const markSeen = useCallback(() => {
    if (!user || !lastAnswer || lastAnswer.created_at <= seen) return;
    setSeen(lastAnswer.created_at);
    try {
      window.localStorage.setItem(seenKey(user.id), lastAnswer.created_at);
    } catch {
      // Storage blocked: the dot just comes back next time.
    }
  }, [user, lastAnswer, seen]);
  return { unread, markSeen };
}

export type SupportThreadSummary = {
  userId: string;
  name: string;
  email: string | null;
  role: string | null;
  org: { id: string; name: string; plan: string | null; trial: boolean } | null;
  lastText: string;
  lastDirection: "in" | "out";
  lastAt: string;
  count: number;
  waitingSince: string | null;
  avgResponseMs: number | null;
};

export type SupportInbox = {
  ready: boolean;
  threads: SupportThreadSummary[];
  stats: { waiting: number; avgResponseMs: number | null; answered: number; questions: number };
};

export function usePlatformSupportThreads() {
  return useQuery({
    queryKey: ["platform_support_threads"],
    refetchInterval: 15_000,
    queryFn: async (): Promise<SupportInbox> => {
      const res = await apiFetch("/platform/support-api");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Yordam so'rovlarini yuklab bo'lmadi");
      return json;
    },
  });
}

export function usePlatformSupportThread(userId: string | null) {
  return useQuery({
    queryKey: ["platform_support_thread", userId],
    enabled: !!userId,
    refetchInterval: 5000,
    queryFn: async (): Promise<SupportMessage[]> => {
      const res = await apiFetch(`/platform/support-api?userId=${encodeURIComponent(userId!)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Yozishmani yuklab bo'lmadi");
      return json.messages;
    },
  });
}

export function useReplySupport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; text: string }): Promise<SupportMessage> => {
      const res = await apiFetch("/platform/support-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "SEND_FAILED");
      return json.message as SupportMessage;
    },
    onSuccess: (message, input) => {
      qc.setQueryData<SupportMessage[]>(["platform_support_thread", input.userId], (old) => [
        ...(old ?? []),
        message,
      ]);
      void qc.invalidateQueries({ queryKey: ["platform_support_threads"] });
    },
  });
}
