// Live support (support_messages): a person's own thread with the SalesIQ
// team, and the platform owner's inbox of every thread.
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SupportMessage } from "@/lib/support";

const isMissing = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /schema cache|does not exist/.test(error.message ?? "");

/**
 * The signed-in person's support thread, oldest first. Polled every few
 * seconds while the chat is open and once in a while otherwise, so an
 * answer lights the assistant button. Null until the table exists.
 */
export function useMySupportMessages(open: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["support_messages", user?.id],
    enabled: !!user && user.role !== "platform_owner",
    refetchInterval: open ? 4000 : 90_000,
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

export function useSendSupportMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
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
    onSuccess: (message) => {
      qc.setQueryData<SupportMessage[] | null>(["support_messages", user?.id], (old) =>
        old?.some((m) => m.id === message.id) ? old : [...(old ?? []), message],
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
