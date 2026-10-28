// Audit history, content library, org structure, rollout plan, training.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import type { CoachingTaskView } from "@/lib/coaching.server";
import type { WeakSpot } from "@/lib/coaching";
import { timeAgo } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { makeResource } from "./core";
import type { LessonProgressRow, Tables, TrainingRecommendationRow } from "./core";
import { useProfilesRaw } from "./config";
import { byId, profileName, useVisibleOwnerIds } from "./crm-views";

/* ------------------------------------------------------------------ */
/* Audit / history — full change trail with time-travel, fed by the     */
/* audit_row_change() triggers on leads/deals/tasks/companies/contacts/ */
/* pipeline_stages/profiles. Each row stores the complete before/after  */
/* row snapshot, so "state as of time X" is just the latest audit row   */
/* at-or-before X — no diff replay needed.                              */
/* ------------------------------------------------------------------ */

export type AuditLogRow = Tables["audit_logs"]["Row"];

export const AUDIT_ENTITY_TYPES = [
  "leads",
  "deals",
  "tasks",
  "companies",
  "contacts",
  "pipeline_stages",
  "profiles",
  "amocrm_calls",
  "work_sessions",
  "call_logs",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditEntryView = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string;
  when: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: string[];
};

const AUDIT_IGNORE_FIELDS = new Set(["updated_at", "created_at"]);

function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (AUDIT_IGNORE_FIELDS.has(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  }
  return changed;
}

function toAuditView(row: AuditLogRow, actorName: string): AuditEntryView {
  const meta = (row.meta ?? {}) as {
    old?: Record<string, unknown>;
    new?: Record<string, unknown>;
  };
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorId: row.actor_id,
    actorName,
    when: timeAgo(row.created_at),
    createdAt: row.created_at,
    before: meta.old ?? null,
    after: meta.new ?? null,
    changedFields: diffFields(meta.old ?? null, meta.new ?? null),
  };
}

/** Full change history for one specific record (used on the lead detail page etc). */
export function useAuditTrail(entityType: AuditEntityType, entityId: string | undefined) {
  const { data: profiles } = useProfilesRaw();
  const query = useQuery({
    queryKey: ["audit_logs", entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo<AuditEntryView[]>(() => {
    const profilesById = byId(profiles);
    return (query.data ?? []).map((r) =>
      toAuditView(r, r.actor_id ? profileName(profilesById.get(r.actor_id)) : "System"),
    );
  }, [query.data, profiles]);
  return { rows, isLoading: query.isLoading };
}

/** Org-wide activity feed across every tracked table — the History page. */
export function useOrgActivityFeed(limit = 200) {
  const { user } = useAuth();
  const { data: profiles } = useProfilesRaw();
  const query = useQuery({
    queryKey: ["audit_logs_feed", user?.organizationId, limit],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo<AuditEntryView[]>(() => {
    const profilesById = byId(profiles);
    return (query.data ?? []).map((r) =>
      toAuditView(r, r.actor_id ? profileName(profilesById.get(r.actor_id)) : "System"),
    );
  }, [query.data, profiles]);
  return { rows, isLoading: query.isLoading, isError: query.isError };
}

// "As of date": reconstructs an entire table's rows exactly as they stood
// at a past moment, via the entities_as_of() SQL function — the latest
// audit_logs snapshot at-or-before that timestamp for every entity_id,
// excluding ones whose latest state by then was a delete. Pages pass the
// result as an override to their normal live-data hook (e.g. useCrmLeads)
// so the rest of the page's joins/rendering logic stays identical.
/**
 * How much the funnel's lead revenue changed since `since` (the Reyting
 * "Bugungi tushum" card), computed in the database from the leads changed
 * since then. null while loading or when the RPC isn't deployed yet.
 */
export function useRevenueChangeSince(since: Date, funnel: string | null) {
  const { user } = useAuth();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerIds = visibleOwnerIds ? [...visibleOwnerIds].sort() : null;
  return useQuery({
    queryKey: [
      "leads",
      "revenue_change",
      user?.organizationId,
      since.toISOString(),
      funnel,
      ownerIds,
    ],
    enabled: !!user?.organizationId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lead_revenue_change_since", {
        p_since: since.toISOString(),
        p_funnel: funnel,
        p_owner_ids: ownerIds,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useAsOfSnapshot<T>(entityType: AuditEntityType, asOf: Date | null) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["entities_as_of", entityType, user?.organizationId, asOf?.toISOString() ?? null],
    enabled: !!user?.organizationId && !!asOf,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase.rpc("entities_as_of", {
        p_organization_id: user!.organizationId!,
        p_entity_type: entityType,
        p_as_of: asOf!.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}

// "Time travel": reconstructs a record's full state as of a past moment —
// the latest audit_logs snapshot at or before that timestamp, since every
// insert/update stores the complete row rather than just a diff.
export function useRecordStateAt() {
  return useMutation({
    mutationFn: async (input: {
      entityType: AuditEntityType;
      entityId: string;
      at: string;
    }): Promise<Record<string, unknown> | null> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("action, meta")
        .eq("entity_type", input.entityType)
        .eq("entity_id", input.entityId)
        .lte("created_at", input.at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const meta = (data.meta ?? {}) as {
        old?: Record<string, unknown>;
        new?: Record<string, unknown>;
      };
      return data.action === "delete" ? (meta.old ?? null) : (meta.new ?? null);
    },
  });
}

/* ------------------------------------------------------------------ */
/* "Hujjat va Darsliklar" -- a shared content library everyone can view */
/* but only super_admin can add to: company info/docs/links (with their */
/* own org-structure and regulations shelves) plus a video/file training */
/* library. Same public-bucket + org-scoped-RLS shape as call-recordings, */
/* just gated by role instead of by uploader.                           */
/* ------------------------------------------------------------------ */

export type ContentLibrarySection =
  | "about_general"
  | "about_org_structure"
  | "about_regulation"
  | "training"
  | "about_sheets"
  | "training_sheets";

export type ContentLibraryItemType =
  "link" | "file" | "image" | "video" | "audio" | "document" | "text";

export type ContentLibraryItemRow = Tables["content_library_items"]["Row"];

export function useContentLibraryItems(section: ContentLibrarySection) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["content_library_items", user?.organizationId, section],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<ContentLibraryItemRow[]> => {
      const { data, error } = await supabase
        .from("content_library_items")
        .select("*")
        .eq("section", section)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateContentLibraryItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      section: ContentLibrarySection;
      title: string;
      description?: string;
      itemType: ContentLibraryItemType;
      url: string | null;
      filePath?: string | null;
      color?: string | null;
    }) => {
      const { error } = await supabase.from("content_library_items").insert({
        organization_id: user!.organizationId!,
        section: input.section,
        title: input.title.trim(),
        description: input.description?.trim() ?? "",
        item_type: input.itemType,
        url: input.url,
        file_path: input.filePath ?? null,
        color: input.color ?? null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({
        queryKey: ["content_library_items", user?.organizationId, vars.section],
      }),
  });
}

export function useUpdateContentLibraryItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      section: ContentLibrarySection;
      patch: { title?: string; description?: string; url?: string; color?: string | null };
    }) => {
      const { error } = await supabase.from("content_library_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({
        queryKey: ["content_library_items", user?.organizationId, vars.section],
      }),
  });
}

export function useDeleteContentLibraryItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_library_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["content_library_items", user?.organizationId] }),
  });
}

/** Uploads a file for the content library; caller creates the item row with the returned url/path afterward. */
export function useUploadContentLibraryFile() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string; path: string }> => {
      const path = `${user!.organizationId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage
        .from("content-library")
        .upload(path, file, file.type ? { contentType: file.type } : {});
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("content-library").getPublicUrl(path);
      return { url: data.publicUrl, path };
    },
  });
}

export type ContentLibrarySettingsRow = Tables["content_library_settings"]["Row"];

export function useContentLibrarySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["content_library_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<ContentLibrarySettingsRow | null> => {
      const { data, error } = await supabase
        .from("content_library_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateContentLibrarySettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      aboutGoogleSheetsUrl?: string;
      trainingGoogleSheetsUrl?: string;
    }) => {
      const { error } = await supabase.from("content_library_settings").upsert(
        {
          organization_id: user!.organizationId!,
          ...(input.aboutGoogleSheetsUrl !== undefined
            ? { about_google_sheets_url: input.aboutGoogleSheetsUrl }
            : {}),
          ...(input.trainingGoogleSheetsUrl !== undefined
            ? { training_google_sheets_url: input.trainingGoogleSheetsUrl }
            : {}),
          updated_by: user!.id,
        },
        { onConflict: "organization_id" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["content_library_settings", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Org structure chart -- a connected hierarchy of role nodes (parent_id */
/* self-reference) rendered as a real org chart in the content library, */
/* instead of a generic document shelf. Deleting a node detaches (not   */
/* cascades) its children, since parent_id uses ON DELETE SET NULL.     */
/* ------------------------------------------------------------------ */

export type OrgStructureNodeRow = Tables["org_structure_nodes"]["Row"];

export function useOrgStructureNodes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_structure_nodes", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgStructureNodeRow[]> => {
      const { data, error } = await supabase
        .from("org_structure_nodes")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateOrgStructureNode() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      parentId: string | null;
      title: string;
      subtitle?: string;
      responsibilities?: string;
      position?: number;
    }): Promise<OrgStructureNodeRow> => {
      const { data, error } = await supabase
        .from("org_structure_nodes")
        .insert({
          organization_id: user!.organizationId!,
          parent_id: input.parentId,
          title: input.title.trim(),
          subtitle: input.subtitle?.trim() ?? "",
          responsibilities: input.responsibilities?.trim() ?? "",
          position: input.position ?? 0,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_structure_nodes", user?.organizationId] }),
  });
}

export function useUpdateOrgStructureNode() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        parentId?: string | null;
        title?: string;
        subtitle?: string;
        responsibilities?: string;
      };
    }) => {
      const { parentId, ...rest } = patch;
      const { error } = await supabase
        .from("org_structure_nodes")
        .update({
          ...rest,
          ...(parentId !== undefined ? { parent_id: parentId } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_structure_nodes", user?.organizationId] }),
  });
}

export function useDeleteOrgStructureNode() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_structure_nodes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_structure_nodes", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Amalga oshirish rejasi" -- a super_admin-only, per-organization     */
/* phased implementation checklist replacing the old company-wide       */
/* "Important Tasks" board: named plans, each a sequence of day-numbered*/
/* tasks (phase/weight/status/note) plus a planned-vs-actual progress   */
/* chart driven by completed_at (set the moment a task is checked off). */
/* ------------------------------------------------------------------ */

export type RolloutPlanRow = Tables["rollout_plans"]["Row"];

export type RolloutPlanTaskRow = Tables["rollout_plan_tasks"]["Row"];

export type RolloutPlanTaskWeight = "light" | "medium" | "heavy";

export type RolloutPlanTaskStatus = "done" | "in_progress" | "not_done";

const rolloutPlansResource = makeResource("rollout_plans", ["rollout_plans"]);

export const useRolloutPlans = () =>
  rolloutPlansResource.useList({ orderBy: "created_at", ascending: false });

export const useDeleteRolloutPlan = rolloutPlansResource.useRemove;

export function useCreateRolloutPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; startDate: string }): Promise<RolloutPlanRow> => {
      const { data, error } = await supabase
        .from("rollout_plans")
        .insert({
          organization_id: user!.organizationId!,
          name: input.name.trim(),
          start_date: input.startDate,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rollout_plans"] }),
  });
}

export function useRolloutPlanTasks(planId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rollout_plan_tasks", planId],
    enabled: !!planId && !!user?.organizationId,
    queryFn: async (): Promise<RolloutPlanTaskRow[]> => {
      const { data, error } = await supabase
        .from("rollout_plan_tasks")
        .select("*")
        .eq("plan_id", planId!)
        .order("day_number", { ascending: true })
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateRolloutPlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      planId: string;
      dayNumber: number;
      phase: string;
      task: string;
      weight: RolloutPlanTaskWeight;
      note?: string;
      position?: number;
    }): Promise<RolloutPlanTaskRow> => {
      const { data, error } = await supabase
        .from("rollout_plan_tasks")
        .insert({
          plan_id: input.planId,
          day_number: input.dayNumber,
          phase: input.phase.trim(),
          task: input.task.trim(),
          weight: input.weight,
          note: input.note?.trim() ?? "",
          position: input.position ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ["rollout_plan_tasks", vars.planId] }),
  });
}

export function useUpdateRolloutPlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      planId,
      patch,
    }: {
      id: string;
      planId: string;
      patch: Database["public"]["Tables"]["rollout_plan_tasks"]["Update"];
    }) => {
      const { error } = await supabase.from("rollout_plan_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ["rollout_plan_tasks", vars.planId] }),
  });
}

// The checklist's primary interaction -- checking a task off sets status to
// 'done' and stamps completed_at with the real moment it happened (so the
// progress chart can plot actual completion against calendar dates, not
// just a point-in-time percentage); unchecking clears both.
export function useSetRolloutPlanTaskDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, planId, done }: { id: string; planId: string; done: boolean }) => {
      const { error } = await supabase
        .from("rollout_plan_tasks")
        .update({
          status: done ? "done" : "not_done",
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ["rollout_plan_tasks", vars.planId] }),
  });
}

export function useDeleteRolloutPlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; planId: string }) => {
      const { error } = await supabase.from("rollout_plan_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ["rollout_plan_tasks", vars.planId] }),
  });
}

// Lets a super_admin pick a background color per phase name so a 7-phase
// plan reads at a glance instead of a wall of identical rows. One row per
// (plan, phase) -- never duplicated onto every task -- so every task
// sharing a phase name always shows the same color.
export type RolloutPlanPhaseColor = Tables["rollout_plan_phase_colors"]["Row"]["color"];

export function useRolloutPlanPhaseColors(planId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rollout_plan_phase_colors", planId],
    enabled: !!planId && !!user?.organizationId,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("rollout_plan_phase_colors")
        .select("phase, color")
        .eq("plan_id", planId!);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.phase] = row.color;
      return map;
    },
  });
}

export function useSetRolloutPlanPhaseColor() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      planId,
      phase,
      color,
    }: {
      planId: string;
      phase: string;
      color: string;
    }) => {
      const { error } = await supabase.from("rollout_plan_phase_colors").upsert(
        {
          plan_id: planId,
          phase,
          color,
          organization_id: user!.organizationId!,
        },
        { onConflict: "plan_id,phase" },
      );
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ["rollout_plan_phase_colors", vars.planId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Training / Tavsiyalar -- video lessons with per-manager watch        */
/* progress, plus training recommendations rolled up from lost-lead     */
/* call analysis (see analyzeCallById in audio-analytics.analyze.ts).   */
/* ------------------------------------------------------------------ */

const lessonsResource = makeResource("lessons", ["lessons"]);

export const useLessons = () => lessonsResource.useList({ orderBy: "position", ascending: true });

export const useCreateLesson = lessonsResource.useCreate;

export const useUpdateLesson = lessonsResource.useUpdate;

export const useDeleteLesson = lessonsResource.useRemove;

export type LessonSectionRow = Tables["lesson_sections"]["Row"];

const lessonSectionsResource = makeResource("lesson_sections", ["lesson_sections"]);

export const useLessonSections = () =>
  lessonSectionsResource.useList({ orderBy: "position", ascending: true });

export const useCreateLessonSection = lessonSectionsResource.useCreate;

export const useUpdateLessonSection = lessonSectionsResource.useUpdate;

export const useDeleteLessonSection = lessonSectionsResource.useRemove;

/** Uploads a lesson video or thumbnail; caller creates/updates the lesson row with the returned url afterward. */
export function useUploadLessonAsset() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      const path = `${user!.organizationId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage
        .from("lesson-videos")
        .upload(path, file, file.type ? { contentType: file.type } : {});
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("lesson-videos").getPublicUrl(path);
      return { url: data.publicUrl };
    },
  });
}

/** Current user's own watch progress across every lesson, keyed by lesson_id. */
export function useMyLessonProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["lesson_progress", "mine", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Record<string, LessonProgressRow>> => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      const byLesson: Record<string, LessonProgressRow> = {};
      for (const row of data ?? []) byLesson[row.lesson_id] = row;
      return byLesson;
    },
  });
}

/** Every manager's progress on one lesson -- backs the per-lesson "Statistika" modal (ROP/super_admin only, enforced by RLS). */
export function useLessonProgressForLesson(lessonId: string | null) {
  return useQuery({
    queryKey: ["lesson_progress", "for_lesson", lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<LessonProgressRow[]> => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("lesson_id", lessonId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertLessonProgress() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      lessonId: string;
      lastPositionSeconds: number;
      completed: boolean;
    }) => {
      const { error } = await supabase.from("lesson_progress").upsert(
        {
          lesson_id: input.lessonId,
          user_id: user!.id,
          organization_id: user!.organizationId!,
          last_position_seconds: input.lastPositionSeconds,
          completed: input.completed,
          completed_at: input.completed ? new Date().toISOString() : null,
          last_watched_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["lesson_progress", "mine", user?.id] });
      void qc.invalidateQueries({ queryKey: ["lesson_progress", "for_lesson", vars.lessonId] });
    },
  });
}

export function useTrainingRecommendations() {
  return useQuery({
    queryKey: ["training_recommendations"],
    queryFn: async (): Promise<TrainingRecommendationRow[]> => {
      const { data, error } = await supabase
        .from("training_recommendations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateTrainingRecommendationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "new" | "acknowledged" | "done" }) => {
      const { error } = await supabase
        .from("training_recommendations")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["training_recommendations"] }),
  });
}

// "To'liq AI onboarding oqimi" — the Telegram interview → AI proposal →
// admin-approved pipeline/quality-stage setup. One row per org
// (organization_id is the primary key), so a plain maybeSingle() relying on
// RLS is enough, same as useAmoConnectionStatus above.
export type OrgAiOnboardingRow = Tables["org_ai_onboarding"]["Row"];

export function useAiOnboarding() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["org_ai_onboarding", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    refetchInterval: (query) => (query.state.data?.status === "interviewing" ? 5_000 : false),
    queryFn: async (): Promise<OrgAiOnboardingRow | null> => {
      const { data, error } = await supabase.from("org_ai_onboarding").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

async function postWithAuth<T>(path: string): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let json: T & { error?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text || `So'rov muvaffaqiyatsiz tugadi (${res.status})`);
  }
  if (!res.ok) throw new Error(json.error ?? "So'rov muvaffaqiyatsiz tugadi");
  return json;
}

export function useStartAiOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postWithAuth<{ started: boolean; telegramLinked: boolean }>("/onboarding/ai-setup/start"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org_ai_onboarding"] }),
  });
}

export function useApplyAiOnboardingProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postWithAuth<{ applied: boolean }>("/onboarding/ai-setup/apply"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["org_ai_onboarding"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      void qc.invalidateQueries({ queryKey: ["lead_quality_stages"] });
    },
  });
}

// The generic "migrate from another CRM" cutover path — a CSV upload,
// parsed and column-mapped in onboarding.data-import.tsx, bulk-inserted by
// onboarding.data-import.upload.ts. One history row per uploaded file.
export type OrgDataImportRow = Tables["org_data_imports"]["Row"];

export function useDataImports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["org_data_imports", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<OrgDataImportRow[]> => {
      const { data, error } = await supabase
        .from("org_data_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type DataImportRow = {
  name: string;
  phone?: string;
  email?: string;
  companyName?: string;
  source?: string;
  budget?: number;
};

export function useImportData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sourceLabel: string; rows: DataImportRow[] }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/onboarding/data-import/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      const text = await res.text();
      let json: { importedLeads: number; importedContacts: number; errorCount: number } & {
        error?: string;
      };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(text || `Import muvaffaqiyatsiz tugadi (${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? "Import muvaffaqiyatsiz tugadi");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["org_data_imports"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export type CoachingOverview =
  | { missing: true; boss: boolean }
  | { missing: false; boss: boolean; weak: WeakSpot[]; tasks: CoachingTaskView[] };

/** Sinfxona → Mashqlar: weakest script steps and the coaching tasks (/coaching). */
export function useCoaching() {
  return useQuery({
    queryKey: ["coaching"],
    staleTime: 60_000,
    queryFn: async (): Promise<CoachingOverview> => {
      const res = await apiFetch("/coaching");
      const json = (await res.json().catch(() => ({}))) as CoachingOverview & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
  });
}

export function useCoachingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body:
        | {
            action: "create";
            profileId: string;
            criterion: string;
            task: string;
            lessonId?: string | null;
            dueDate?: string | null;
          }
        | { action: "done" | "delete"; id: string },
    ) => {
      const res = await apiFetch("/coaching", { method: "POST", body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["coaching"] }),
  });
}
