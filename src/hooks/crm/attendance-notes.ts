// Davomat izohlari (src/lib/attendance-notes.ts): the comments people leave
// about their day -- from the staff Telegram bot or here on the site -- for
// Nazorat -> Davomat. RLS shows a person their own and admins / heads of
// sales the company's. A comment written in Telegram arrives live.
import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { NoteKind } from "@/lib/attendance-notes";

export type AttendanceNote = {
  id: string;
  profile_id: string;
  day: string;
  kind: NoteKind;
  body: string;
  source: "telegram" | "web";
  created_at: string;
};

/** Today as the browser sees it, "YYYY-MM-DD". */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const missing = (msg: string) => /attendance_notes|does not exist|schema cache/i.test(msg);

/** The day's comments by person (null until the database update has run). */
export function useAttendanceNotes(day = localDay()) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = user?.organizationId ?? null;
  const key = ["attendance_notes", orgId, day];
  // One channel per use: the page and its "my status" card each listen.
  const uid = useId();

  // Its own channel: a missing table never disturbs the page's other live updates.
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`attendance-notes-${orgId}-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_notes",
          filter: `organization_id=eq.${orgId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["attendance_notes", orgId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, qc, uid]);

  return useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async (): Promise<Map<string, AttendanceNote[]> | null> => {
      const { data, error } = await supabase
        .from("attendance_notes")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("day", day)
        .order("created_at", { ascending: true });
      if (error) {
        if (missing(error.message)) return null;
        throw error;
      }
      const by = new Map<string, AttendanceNote[]>();
      for (const n of (data ?? []) as AttendanceNote[]) {
        by.set(n.profile_id, [...(by.get(n.profile_id) ?? []), n]);
      }
      return by;
    },
  });
}

/** The signed-in person's comment on today, from the site. */
export function useAddAttendanceNote() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { body: string; kind: NoteKind }) => {
      const { error } = await supabase.from("attendance_notes").insert({
        organization_id: user!.organizationId!,
        profile_id: user!.id,
        day: localDay(),
        kind: v.kind,
        body: v.body,
        source: "web",
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["attendance_notes"] }),
  });
}

/** Removes one of the signed-in person's own comments. */
export function useDeleteAttendanceNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["attendance_notes"] }),
  });
}
