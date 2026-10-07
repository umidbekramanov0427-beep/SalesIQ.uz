import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { tashkentToday } from "@/lib/intern-roadmap";

export type MentorMessageRow = Database["public"]["Tables"]["intern_mentor_messages"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type InternRow = Pick<
  ProfileRow,
  | "id"
  | "full_name"
  | "email"
  | "internship_start_date"
  | "internship_days"
  | "telegram_chat_id"
  | "intern_group_chat_id"
  | "onboarding_status"
  | "mentor_last_checkin_at"
>;
type LessonProgressRow = Database["public"]["Tables"]["lesson_progress"]["Row"];

// The mentor routes live only in this app's TypeScript backend, so these
// call it same-origin (not through apiFetch's optional Python base URL).
async function postMentor<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: T & { error?: string };
  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

/** One intern's conversation with the mentor, oldest first. Polls so cron check-ins show up. */
export function useMentorMessages(internId: string | null | undefined) {
  return useQuery({
    queryKey: ["intern_mentor_messages", internId],
    enabled: !!internId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MentorMessageRow[]> => {
      const { data, error } = await supabase
        .from("intern_mentor_messages")
        .select("*")
        .eq("intern_id", internId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });
}

export function useSendMentorMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (text: string) => postMentor<{ reply: string }>("/intern-mentor/chat", { text }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["intern_mentor_messages", user?.id] }),
  });
}

export function useMentorGroupCode() {
  return useMutation({
    mutationFn: (internId?: string) =>
      postMentor<{ code: string; botUsername: string | null }>(
        "/intern-mentor/group-code",
        internId ? { internId } : {},
      ),
  });
}

/**
 * Asks the server for today's greeting once per day per browser (the
 * server itself also guarantees once per probation day). Mount for interns.
 */
export function useMentorDailyGreeting() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.isIntern && !!user.internshipStartDate;
  useEffect(() => {
    if (!enabled || !user) return;
    const key = `salesos.mentor.greeted.${user.id}`;
    const today = tashkentToday();
    try {
      if (localStorage.getItem(key) === today) return;
    } catch {
      // storage unavailable -- the server-side check still prevents repeats
    }
    void postMentor<{ greeted: boolean }>("/intern-mentor/greet")
      .then(() => {
        try {
          localStorage.setItem(key, today);
        } catch {
          // ignore
        }
        void qc.invalidateQueries({ queryKey: ["intern_mentor_messages", user.id] });
      })
      .catch(() => undefined);
  }, [enabled, user, qc]);
}

/** Every intern in the caller's org -- the ROP/admin overview. */
export function useOrgInterns(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_interns", user?.organizationId],
    enabled: enabled && !!user?.organizationId,
    queryFn: async (): Promise<InternRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, internship_start_date, internship_days, telegram_chat_id, intern_group_chat_id, onboarding_status, mentor_last_checkin_at",
        )
        .eq("organization_id", user!.organizationId!)
        .eq("is_intern", true)
        .order("internship_start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InternRow[];
    },
  });
}

/** Lesson progress for any one user (own row, or an intern's for ROP/admin via RLS). */
export function useUserLessonProgress(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["lesson_progress", "user", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, LessonProgressRow>> => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("user_id", userId!);
      if (error) throw error;
      const byLesson: Record<string, LessonProgressRow> = {};
      for (const row of data ?? []) byLesson[row.lesson_id] = row;
      return byLesson;
    },
  });
}
