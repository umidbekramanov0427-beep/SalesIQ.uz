import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatFollowUp, initialsOf, timeAgo } from "@/lib/utils";
import type { StoredCustomerProfile } from "@/lib/ai-customer-profile";

type Tables = Database["public"]["Tables"];
export type ProfileRow = Tables["profiles"]["Row"];
export type StageRow = Tables["pipeline_stages"]["Row"];
export type CompanyRow = Tables["companies"]["Row"];
export type ContactRow = Tables["contacts"]["Row"];
export type LeadRow = Tables["leads"]["Row"];
export type TaskRow = Tables["tasks"]["Row"];
export type TaskCommentRow = Tables["task_comments"]["Row"];
export type NotificationRow = Tables["notifications"]["Row"];
export type LeadActivityRow = Tables["lead_activities"]["Row"];
export type AmoCrmCallRow = Tables["amocrm_calls"]["Row"];
export type QualificationGroupRow = Tables["call_qualification_groups"]["Row"];
export type QualificationCriterionRow = Tables["call_qualification_criteria"]["Row"];
export type CallCategoryRow = Tables["call_categories"]["Row"];
export type CallSkillRow = Tables["call_skills"]["Row"];
export type CallStageRow = Tables["call_stages"]["Row"];
export type CallStageStepRow = Tables["call_stage_steps"]["Row"];
export type ServiceLineRow = Tables["service_lines"]["Row"];
export type IntakeQuestionRow = Tables["intake_questions"]["Row"];
export type LeadQualityStageRow = Tables["lead_quality_stages"]["Row"];
export type LessonRow = Tables["lessons"]["Row"];
export type LessonProgressRow = Tables["lesson_progress"]["Row"];
export type TrainingRecommendationRow = Tables["training_recommendations"]["Row"];
export type DailyReportSettingsRow = Tables["daily_report_settings"]["Row"];
export type ReportStageTransitionRuleRow = Tables["daily_report_stage_transition_rules"]["Row"];
export type MiniAppAudioRuleRow = Tables["daily_report_mini_app_audio_rules"]["Row"];

/* ------------------------------------------------------------------ */
/* Generic CRUD resource factory — one query key per table, list reads */
/* plus create/update/delete mutations that invalidate that key.       */
/* ------------------------------------------------------------------ */

// Supabase/PostgREST caps a single select() response at 1000 rows by
// default — a plain `.select("*")` with no `.range()` silently truncates
// past that instead of erroring, so any org whose row count crosses 1000
// (leads is the first table this happened to) quietly loses data off the
// end with no error anywhere. Page through with `.range()` until a page
// comes back short, keeping a stable `id` tiebreaker so results stay
// disjoint across pages regardless of what orderBy the caller asked for.
const RESOURCE_PAGE_SIZE = 1000;
// Large AmoCRM-synced accounts can have several thousand rows per table
// (leads/contacts/companies/pipeline_stages). Fetching pages one at a time,
// each awaited before the next request even starts, meant every CRM page
// load paid the full network round-trip cost of every page in sequence —
// the dominant cause of "still loading" for these accounts. Requesting a
// batch of pages concurrently (same pattern used for AmoCRM's own paginated
// fetches in client.server.ts) cuts that wall-clock time roughly by the
// batch size.
const LIST_PAGE_CONCURRENCY = 4;

function makeResource<TableName extends keyof Tables>(table: TableName, queryKey: QueryKey) {
  type Row = Tables[TableName]["Row"];
  type Insert = Tables[TableName]["Insert"];
  type Update = Tables[TableName]["Update"];

  function useList(config?: {
    orderBy?: string;
    ascending?: boolean;
    enabled?: boolean;
    refetchInterval?: number | false;
    // Explicit .eq() filter, applied in addition to whatever RLS already
    // allows. Needed for `profiles` specifically: its SELECT policy grants
    // platform_owner cross-org read access (for the /platform/users
    // screen), so a platform_owner who also runs their own company would
    // otherwise see every other company's employees mixed into their own
    // org's team lists, leaderboards and assignee pickers — RLS alone
    // can't tell "the /platform screen wants everyone" apart from "this
    // page wants my team".
    filterEq?: { column: string; value: string } | undefined;
  }) {
    return useQuery({
      queryKey,
      enabled: config?.enabled ?? true,
      refetchInterval: config?.refetchInterval ?? false,
      queryFn: async (): Promise<Row[]> => {
        const fetchPage = async (from: number): Promise<Row[]> => {
          let query = supabase.from(table).select("*");
          if (config?.filterEq) {
            query = query.eq(config.filterEq.column as never, config.filterEq.value as never);
          }
          if (config?.orderBy)
            query = query.order(config.orderBy, { ascending: config?.ascending ?? true });
          query = query
            .order("id" as never, { ascending: true })
            .range(from, from + RESOURCE_PAGE_SIZE - 1);
          const { data, error } = await query;
          if (error) throw error;
          return (data ?? []) as unknown as Row[];
        };

        const all: Row[] = [];
        let from = 0;
        let done = false;
        while (!done) {
          const starts = Array.from(
            { length: LIST_PAGE_CONCURRENCY },
            (_, i) => from + i * RESOURCE_PAGE_SIZE,
          );
          const pages = await Promise.all(starts.map(fetchPage));
          for (const page of pages) {
            all.push(...page);
            if (page.length < RESOURCE_PAGE_SIZE) done = true;
          }
          from += LIST_PAGE_CONCURRENCY * RESOURCE_PAGE_SIZE;
        }
        return all;
      },
    });
  }

  function useCreate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: Insert): Promise<Row> => {
        const { data, error } = await supabase
          .from(table)
          .insert(input as never)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as Row;
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey }),
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Update }): Promise<Row> => {
        const { data, error } = await supabase
          .from(table)
          .update(patch as never)
          .eq("id" as never, id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as Row;
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey }),
    });
  }

  function useRemove() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id" as never, id);
        if (error) throw error;
        return id;
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey }),
    });
  }

  return { useList, useCreate, useUpdate, useRemove };
}

const companiesResource = makeResource("companies", ["companies"]);
const contactsResource = makeResource("contacts", ["contacts"]);
const leadsResource = makeResource("leads", ["leads"]);
const tasksResource = makeResource("tasks", ["tasks"]);
const profilesResource = makeResource("profiles", ["profiles"]);
const stagesResource = makeResource("pipeline_stages", ["pipeline_stages"]);
const pipelinesResource = makeResource("pipelines", ["pipelines"]);
const stageRulesResource = makeResource("pipeline_stage_rules", ["pipeline_stage_rules"]);
const notificationsResource = makeResource("notifications", ["notifications"]);
const leadActivitiesResource = makeResource("lead_activities", ["lead_activities"]);
const workSessionsResource = makeResource("work_sessions", ["work_sessions"]);
const callLogsResource = makeResource("call_logs", ["call_logs"]);
const amocrmCallsResource = makeResource("amocrm_calls", ["amocrm_calls"]);
const settingListsResource = makeResource("setting_lists", ["setting_lists"]);
const rolePermissionsResource = makeResource("role_permissions", ["role_permissions"]);
const qualificationGroupsResource = makeResource("call_qualification_groups", [
  "call_qualification_groups",
]);
const qualificationCriteriaResource = makeResource("call_qualification_criteria", [
  "call_qualification_criteria",
]);
const callCategoriesResource = makeResource("call_categories", ["call_categories"]);
const callSkillsResource = makeResource("call_skills", ["call_skills"]);
const callStagesResource = makeResource("call_stages", ["call_stages"]);
const callStageStepsResource = makeResource("call_stage_steps", ["call_stage_steps"]);
const serviceLinesResource = makeResource("service_lines", ["service_lines"]);
const intakeQuestionsResource = makeResource("intake_questions", ["intake_questions"]);
const reportStageTransitionRulesResource = makeResource("daily_report_stage_transition_rules", [
  "daily_report_stage_transition_rules",
]);
const miniAppAudioRulesResource = makeResource("daily_report_mini_app_audio_rules", [
  "daily_report_mini_app_audio_rules",
]);
const leadQualityStagesResource = makeResource("lead_quality_stages", ["lead_quality_stages"]);

export const useCompaniesRaw = (opts?: Parameters<typeof companiesResource.useList>[0]) =>
  companiesResource.useList({ orderBy: "created_at", ascending: false, ...opts });
export const useCreateCompany = companiesResource.useCreate;
export const useUpdateCompany = companiesResource.useUpdate;
export const useDeleteCompany = companiesResource.useRemove;

export const useContactsRaw = (opts?: Parameters<typeof contactsResource.useList>[0]) =>
  contactsResource.useList({ orderBy: "created_at", ascending: false, ...opts });
export const useCreateContact = contactsResource.useCreate;
export const useUpdateContact = contactsResource.useUpdate;
export const useDeleteContact = contactsResource.useRemove;

export const useLeadsRaw = (opts?: Parameters<typeof leadsResource.useList>[0]) =>
  leadsResource.useList({ orderBy: "created_at", ascending: false, ...opts });
export const useCreateLead = leadsResource.useCreate;
export const useDeleteLead = leadsResource.useRemove;

// Same update as leadsResource.useUpdate, but also invalidates
// pipeline_board_leads -- the AmoCRM board and Voronkalar's funnel detail
// view both read leads through that separate, funnel-scoped query (see
// usePipelineBoardLeadsRaw) instead of the plain ["leads"] cache this
// generic resource invalidates, so a drag-and-drop stage move or a tag
// edit from either page never showed up there until a hard reload.
export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["leads"]["Update"];
    }): Promise<LeadRow> => {
      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

export const useTasksRaw = (opts?: Parameters<typeof tasksResource.useList>[0]) =>
  tasksResource.useList({ orderBy: "due_date", ascending: true, ...opts });
export const useCreateTask = tasksResource.useCreate;
export const useUpdateTask = tasksResource.useUpdate;
export const useDeleteTask = tasksResource.useRemove;

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task_comments", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskCommentRow[]> => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      content: string;
      authorId: string | null;
    }): Promise<TaskCommentRow> => {
      const { data, error } = await supabase
        .from("task_comments")
        .insert({ task_id: input.taskId, content: input.content, author_id: input.authorId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ["task_comments", vars.taskId] }),
  });
}

// Explicitly org-scoped, on top of whatever RLS already allows -- see the
// comment on `filterEq` in makeResource. Every regular (non-/platform/*)
// caller of this hook wants "my company's team", including a platform_owner
// who also runs their own org day to day; the dedicated cross-org listing
// for the /platform/users screen is the separate useAllProfiles() below.
export const useProfilesRaw = (opts?: Parameters<typeof profilesResource.useList>[0]) => {
  const { user } = useAuth();
  return profilesResource.useList({
    orderBy: "full_name",
    ...opts,
    enabled: (opts?.enabled ?? true) && !!user?.organizationId,
    filterEq: user?.organizationId
      ? { column: "organization_id", value: user.organizationId }
      : undefined,
  });
};
export const useUpdateProfile = profilesResource.useUpdate;
export const useDeleteProfile = profilesResource.useRemove;

export const usePipelineStagesRaw = (opts?: Parameters<typeof stagesResource.useList>[0]) =>
  stagesResource.useList({ orderBy: "position", ...opts });
export const useCreateStage = stagesResource.useCreate;
export const useUpdateStage = stagesResource.useUpdate;
export const useDeleteStage = stagesResource.useRemove;

// Named, orderable, colorable pipelines ("voronka") -- the object
// pipeline_stages.pipeline_name used to only exist as a plain string.
// Every org always has at least one (seeded by the schema migration), so
// the Pipelines settings page and the pipeline picker on the Kanban board
// can both assume this list is never empty.
export type PipelineRow = Tables["pipelines"]["Row"];
export const usePipelines = (opts?: Parameters<typeof pipelinesResource.useList>[0]) =>
  pipelinesResource.useList({ orderBy: "position", ...opts });
export const useCreatePipeline = pipelinesResource.useCreate;
export const useUpdatePipeline = pipelinesResource.useUpdate;
export const useDeletePipeline = pipelinesResource.useRemove;

// Mandatory note/task rules a stage can carry -- see pipeline_stage_rules.
// Fetched as a flat list (one row per stage that has a rule at all; a
// stage with neither flag set just has no row) and looked up by stage_id
// client-side, rather than one query per stage.
export type PipelineStageRuleRow = Tables["pipeline_stage_rules"]["Row"];
export const useStageRules = (opts?: Parameters<typeof stageRulesResource.useList>[0]) =>
  stageRulesResource.useList(opts);

// One rule per stage (stage_id is unique) -- upsert instead of the plain
// useCreate/useUpdate split every other resource uses, since the caller
// (the Pipelines settings page) never needs to know whether a row already
// exists for this stage, only what its two flags should now be.
export function useSetStageRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      stageId: string;
      requiresNote: boolean;
      requiresTask: boolean;
    }): Promise<void> => {
      const { error } = await supabase.from("pipeline_stage_rules").upsert(
        {
          stage_id: input.stageId,
          requires_note: input.requiresNote,
          requires_task: input.requiresTask,
        } as never,
        { onConflict: "stage_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pipeline_stage_rules"] }),
  });
}

export const useWorkSessionsRaw = (opts?: Parameters<typeof workSessionsResource.useList>[0]) =>
  workSessionsResource.useList({ orderBy: "clock_in", ascending: false, ...opts });
export const useCreateWorkSession = workSessionsResource.useCreate;
export const useUpdateWorkSession = workSessionsResource.useUpdate;

export const useCallLogsRaw = (opts?: Parameters<typeof callLogsResource.useList>[0]) =>
  callLogsResource.useList({ orderBy: "created_at", ascending: false, ...opts });
export const useCreateCallLog = callLogsResource.useCreate;

export const useAmoCrmCallsRaw = (opts?: Parameters<typeof amocrmCallsResource.useList>[0]) =>
  amocrmCallsResource.useList({ orderBy: "occurred_at", ascending: false, ...opts });

// Audio tahlil defaults to a bounded recent window (see audio-analytics.tsx)
// instead of unconditionally fetching this org's entire call history --
// amocrm_calls rows carry a transcript plus a full AI analysis JSON blob
// per call, so on an org with a long AmoCRM history every page open paid
// to download years of that. Widening the page's date filter re-runs this
// with a wider (or, for "All Time", unbounded) range instead of just
// re-filtering an already-fetched full table client-side.
export function useAmoCrmCallsSince(
  range: { from: Date | null; to: Date | null } | null,
  opts?: { enabled?: boolean },
) {
  const fromISO = range?.from ? range.from.toISOString() : null;
  const toISO = range?.to ? range.to.toISOString() : null;
  return useQuery({
    queryKey: ["amocrm_calls_since", fromISO, toISO],
    enabled: opts?.enabled ?? true,
    queryFn: async (): Promise<AmoCrmCallRow[]> => {
      const fetchPage = async (from: number): Promise<AmoCrmCallRow[]> => {
        let query = supabase.from("amocrm_calls").select("*");
        if (fromISO) query = query.gte("occurred_at", fromISO);
        if (toISO) query = query.lte("occurred_at", toISO);
        query = query
          .order("occurred_at", { ascending: false })
          .order("id" as never, { ascending: true })
          .range(from, from + RESOURCE_PAGE_SIZE - 1);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as unknown as AmoCrmCallRow[];
      };

      const all: AmoCrmCallRow[] = [];
      let from = 0;
      let done = false;
      while (!done) {
        const starts = Array.from(
          { length: LIST_PAGE_CONCURRENCY },
          (_, i) => from + i * RESOURCE_PAGE_SIZE,
        );
        const pages = await Promise.all(starts.map(fetchPage));
        for (const page of pages) {
          all.push(...page);
          if (page.length < RESOURCE_PAGE_SIZE) done = true;
        }
        from += LIST_PAGE_CONCURRENCY * RESOURCE_PAGE_SIZE;
      }
      return all;
    },
  });
}

export type SettingListType =
  | "categories"
  | "sales_stages"
  | "score_modifiers"
  | "skills"
  | "qualification_groups"
  | "lead_categories"
  | "conversion_targets";

/** One of the seven admin-managed named lists shown under Settings (categories, score modifiers, etc). */
export function useSettingList(listType: SettingListType) {
  const { data, ...rest } = settingListsResource.useList({ orderBy: "position" });
  const items = (data ?? []).filter((item) => item.list_type === listType);
  return { ...rest, data: items };
}
export const useCreateSettingListItem = settingListsResource.useCreate;
export const useUpdateSettingListItem = settingListsResource.useUpdate;
export const useDeleteSettingListItem = settingListsResource.useRemove;

/* ------------------------------------------------------------------ */
/* Qualification Groups: BANT-style weighted criteria, one group per   */
/* funnel/use-case.                                                    */
/* ------------------------------------------------------------------ */

export const useQualificationGroups = (
  opts?: Parameters<typeof qualificationGroupsResource.useList>[0],
) => qualificationGroupsResource.useList({ orderBy: "position", ...opts });
export const useCreateQualificationGroup = qualificationGroupsResource.useCreate;
export const useUpdateQualificationGroup = qualificationGroupsResource.useUpdate;
export const useDeleteQualificationGroup = qualificationGroupsResource.useRemove;

export const useQualificationCriteria = (
  opts?: Parameters<typeof qualificationCriteriaResource.useList>[0],
) => qualificationCriteriaResource.useList({ orderBy: "position", ...opts });
export const useCreateQualificationCriterion = qualificationCriteriaResource.useCreate;
export const useUpdateQualificationCriterion = qualificationCriteriaResource.useUpdate;
export const useDeleteQualificationCriterion = qualificationCriteriaResource.useRemove;

/* ------------------------------------------------------------------ */
/* Call-scoring rubric: Categories group Stages, Stages contain Steps, */
/* each Step optionally scores against a Skill (radar-chart axis).     */
/* ------------------------------------------------------------------ */

export const useCallCategories = (opts?: Parameters<typeof callCategoriesResource.useList>[0]) =>
  callCategoriesResource.useList({ orderBy: "position", ...opts });
export const useCreateCallCategory = callCategoriesResource.useCreate;
export const useUpdateCallCategory = callCategoriesResource.useUpdate;
export const useDeleteCallCategory = callCategoriesResource.useRemove;

export const useCallSkills = (opts?: Parameters<typeof callSkillsResource.useList>[0]) =>
  callSkillsResource.useList({ orderBy: "position", ...opts });
export const useCreateCallSkill = callSkillsResource.useCreate;
export const useUpdateCallSkill = callSkillsResource.useUpdate;
export const useDeleteCallSkill = callSkillsResource.useRemove;

export const useCallStagesRaw = (opts?: Parameters<typeof callStagesResource.useList>[0]) =>
  callStagesResource.useList({ orderBy: "position", ...opts });
export const useCreateCallStage = callStagesResource.useCreate;
export const useUpdateCallStage = callStagesResource.useUpdate;
export const useDeleteCallStage = callStagesResource.useRemove;

export const useCallStageStepsRaw = (opts?: Parameters<typeof callStageStepsResource.useList>[0]) =>
  callStageStepsResource.useList({ orderBy: "position", ...opts });
export const useCreateCallStageStep = callStageStepsResource.useCreate;
export const useUpdateCallStageStep = callStageStepsResource.useUpdate;
export const useDeleteCallStageStep = callStageStepsResource.useRemove;

/* ------------------------------------------------------------------ */
/* "Baholash mezoni": service lines (business's own products), intake  */
/* questions per line, and ordered lead-quality stages (qualified vs   */
/* not) -- config-only tables the AI-prompt builder reads from.        */
/* ------------------------------------------------------------------ */

export const useServiceLines = (opts?: Parameters<typeof serviceLinesResource.useList>[0]) =>
  serviceLinesResource.useList({ orderBy: "position", ...opts });
export const useCreateServiceLine = serviceLinesResource.useCreate;
export const useUpdateServiceLine = serviceLinesResource.useUpdate;
export const useDeleteServiceLine = serviceLinesResource.useRemove;

export const useIntakeQuestions = (opts?: Parameters<typeof intakeQuestionsResource.useList>[0]) =>
  intakeQuestionsResource.useList({ orderBy: "position", ...opts });
export const useCreateIntakeQuestion = intakeQuestionsResource.useCreate;
export const useUpdateIntakeQuestion = intakeQuestionsResource.useUpdate;
export const useDeleteIntakeQuestion = intakeQuestionsResource.useRemove;

export const useLeadQualityStages = (
  opts?: Parameters<typeof leadQualityStagesResource.useList>[0],
) => leadQualityStagesResource.useList({ orderBy: "position", ...opts });
export const useCreateLeadQualityStage = leadQualityStagesResource.useCreate;
export const useUpdateLeadQualityStage = leadQualityStagesResource.useUpdate;
export const useDeleteLeadQualityStage = leadQualityStagesResource.useRemove;

/* ------------------------------------------------------------------ */
/* "Kunlik hisobot sozlamalari" -- which sections/scopes appear in the */
/* automated Telegram daily report (see telegram-report.server.ts).   */
/* ------------------------------------------------------------------ */

export function useDailyReportSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["daily_report_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<DailyReportSettingsRow | null> => {
      const { data, error } = await supabase
        .from("daily_report_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateDailyReportSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          DailyReportSettingsRow,
          | "managers_activity_enabled"
          | "managers_activity_manager_ids"
          | "leads_movement_enabled"
          | "leads_movement_funnels"
          | "lead_quality_enabled"
          | "lead_quality_stage_ids"
          | "intake_questions_enabled"
          | "intake_question_ids"
          | "crm_activity_enabled"
          | "tasks_plan_enabled"
          | "call_quality_enabled"
          | "service_lines_enabled"
          | "recommendations_enabled"
          | "summary_enabled"
          | "report_sample_override"
          | "send_enabled"
          | "send_time"
          | "report_language"
          | "task_due_reminder_enabled"
          | "task_due_reminder_minutes_before"
          | "morning_summary_enabled"
          | "manager_conversion_recommendations_enabled"
          | "manager_conversion_recommendation_criterion_ids"
          | "call_audio_mini_app_enabled"
          | "google_sheets_url"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("daily_report_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["daily_report_settings", user?.organizationId] }),
  });
}

export function useDailyReportPreview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["daily_report_preview", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<{ text: string; override: boolean }> => {
      const res = await apiFetch("/daily-report-settings/preview");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Hisobot namunasini yuklab bo'lmadi");
      return json;
    },
  });
}

export type DailyReportHistoryRow = Tables["daily_report_history"]["Row"];

// The permanent, dated record of every day's full report the scheduled send
// job saves -- lets the platform show "hisobotni sana bilan ko'rish" even
// without opening Telegram.
export function useDailyReportHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["daily_report_history", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<DailyReportHistoryRow[]> => {
      const { data, error } = await supabase
        .from("daily_report_history")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("report_date", { ascending: false })
        .limit(90);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const useReportStageTransitionRules = (
  opts?: Parameters<typeof reportStageTransitionRulesResource.useList>[0],
) => reportStageTransitionRulesResource.useList({ orderBy: "position", ...opts });
export const useCreateReportStageTransitionRule = reportStageTransitionRulesResource.useCreate;
export const useDeleteReportStageTransitionRule = reportStageTransitionRulesResource.useRemove;

export const useMiniAppAudioRules = (
  opts?: Parameters<typeof miniAppAudioRulesResource.useList>[0],
) => miniAppAudioRulesResource.useList({ orderBy: "position", ...opts });
export const useCreateMiniAppAudioRule = miniAppAudioRulesResource.useCreate;
export const useDeleteMiniAppAudioRule = miniAppAudioRulesResource.useRemove;

export const useRolePermissions = (opts?: Parameters<typeof rolePermissionsResource.useList>[0]) =>
  rolePermissionsResource.useList(opts);
export const useUpdateRolePermission = rolePermissionsResource.useUpdate;
export const useCreateRolePermission = rolePermissionsResource.useCreate;

// Real enforcement, not just a stored preference: super_admin/platform_owner
// always pass; rop/sotuv_menejeri are gated by their row in role_permissions
// (see Huquqlar jadvali). No row for that action+role = denied, matching
// "unconfigured means no access" rather than silently allowing everything.
export function usePermission(action: string): boolean {
  const { user } = useAuth();
  const { data: permissions } = useRolePermissions();
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "platform_owner") return true;
  return (permissions ?? []).some((p) => p.action === action && p.role === user.role && p.allowed);
}

export const useCreateNotification = notificationsResource.useCreate;
export const useUpdateNotification = notificationsResource.useUpdate;

export const useLeadActivities = (leadId: string | undefined) =>
  useQuery({
    queryKey: ["lead_activities", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadActivityRow[]> => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
export const useCreateLeadActivity = leadActivitiesResource.useCreate;

export function useNotificationsRaw() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lookup maps — small helpers shared by the view hooks below.         */
/* ------------------------------------------------------------------ */

function byId<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows ?? []) m.set(r.id, r);
  return m;
}

function profileName(p: ProfileRow | undefined): string {
  return p?.full_name || p?.email || "Unassigned";
}

/* ------------------------------------------------------------------ */
/* Composite loader — everything the CRM views need, fetched once and  */
/* joined client-side (small workspace-scale data, no N+1 queries).    */
/* ------------------------------------------------------------------ */

// Which owner_id values the current user is allowed to see, for pages that
// scope leads/deals/calls to "your own data" (sotuv_menejeri) or "your
// team's data" (rop). Returns null for unrestricted roles (super_admin,
// platform_owner) — callers should treat null as "don't filter".
export function useVisibleOwnerIds(): Set<string> | null {
  const { user } = useAuth();
  const { data: profiles } = useProfilesRaw();
  return useMemo(() => {
    if (!user) return new Set<string>();
    if (user.role === "super_admin" || user.role === "platform_owner") return null;
    if (user.role === "rop") {
      const ids = new Set<string>([user.id]);
      for (const p of profiles ?? []) {
        if (p.manager_id === user.id) ids.add(p.id);
      }
      return ids;
    }
    // sotuv_menejeri (and any legacy role) only ever sees their own data.
    return new Set<string>([user.id]);
  }, [user, profiles]);
}

export function useCrmBase(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const companies = useCompaniesRaw({ enabled });
  const contacts = useContactsRaw({ enabled });
  const leads = useLeadsRaw({ enabled });
  const stages = usePipelineStagesRaw({ enabled });
  const profiles = useProfilesRaw({ enabled });
  const visibleOwnerIds = useVisibleOwnerIds();

  const isLoading =
    companies.isLoading ||
    contacts.isLoading ||
    leads.isLoading ||
    stages.isLoading ||
    profiles.isLoading;
  const isError =
    companies.isError || contacts.isError || leads.isError || stages.isError || profiles.isError;

  // sotuv_menejeri only works their own pipeline; rop works their team's.
  // Managers/reps are gone as roles, but the same scoping now applies to
  // their replacements. Super admins keep the full, company-wide view.
  const scopedLeads = useMemo(
    () =>
      visibleOwnerIds
        ? (leads.data ?? []).filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
        : (leads.data ?? []),
    [leads.data, visibleOwnerIds],
  );

  return {
    companies: companies.data ?? [],
    contacts: contacts.data ?? [],
    leads: scopedLeads,
    stages: stages.data ?? [],
    profiles: profiles.data ?? [],
    isLoading,
    isError,
  };
}

/* ------------------------------------------------------------------ */
/* View: CRM Leads (register + detail page) — shaped like the former  */
/* CrmLead mock type so existing UI keeps working against real data.  */
/* ------------------------------------------------------------------ */

export type CrmLeadView = {
  id: string;
  name: string;
  initials: string;
  company: string;
  companyId: string;
  position: string;
  phone: string;
  altPhone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  source: string;
  campaign: string;
  utm: string;
  owner: string;
  ownerId: string;
  manager: string;
  priority: LeadRow["priority"];
  score: number;
  temperature: LeadRow["temperature"];
  budget: number;
  expectedRevenue: number;
  country: string;
  region: string;
  city: string;
  address: string;
  stage: string;
  stageId: string;
  // Comparing `stage` (a free-text stage name) against the literal string
  // "Won"/"Lost" only works for the original demo-seeded stages — an
  // AmoCRM-synced stage keeps AmoCRM's own status name (e.g. "Успешно
  // реализовано"), so that comparison silently never matches for real
  // AmoCRM data. These come straight from pipeline_stages.is_won/is_lost
  // instead, which stay correct regardless of what the stage is named.
  stageIsWon: boolean;
  stageIsLost: boolean;
  funnel: string;
  nextFollowUp: string;
  lastContact: string;
  created: string;
  createdAtIso: string;
  updated: string;
  tags: string[];
  amocrmId: number | null;
  aiCustomerProfile: StoredCustomerProfile | null;
};

// Shared lead-row -> display-view mapper, used by every hook that needs
// CrmLeadView shape: the full-org useCrmLeads() below, plus the lean
// single-lead and paginated-list hooks that don't fetch contacts at all
// (contact is optional there — its fields just come back blank, which is
// fine since the leads register table never renders them).
function leadRowToView(
  l: LeadRow,
  contact: ContactRow | null | undefined,
  profilesById: Map<string, ProfileRow>,
  stagesById: Map<string, StageRow>,
): CrmLeadView {
  const owner = l.owner_id ? profilesById.get(l.owner_id) : undefined;
  const manager = l.manager_id ? profilesById.get(l.manager_id) : undefined;
  const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
  return {
    id: l.id,
    name: l.name,
    initials: initialsOf(l.name),
    company: l.company_name,
    companyId: l.company_id ?? "",
    position: contact?.position ?? "",
    phone: contact?.phone ?? "",
    altPhone: contact?.alt_phone ?? "",
    email: contact?.email ?? "",
    telegram: contact?.telegram ?? "",
    whatsapp: contact?.whatsapp ?? "",
    source: l.source ?? "",
    campaign: l.campaign ?? "",
    utm: l.utm ?? "",
    owner: owner ? profileName(owner) : "Unassigned",
    ownerId: l.owner_id ?? "",
    manager: manager ? profileName(manager) : "—",
    priority: l.priority,
    score: l.score,
    temperature: l.temperature,
    budget: l.budget,
    expectedRevenue: l.expected_revenue,
    country: l.country ?? "",
    region: l.region ?? "",
    city: l.city ?? "",
    address: l.address ?? "",
    stage: stage?.name ?? "New Lead",
    stageId: l.stage_id ?? "",
    stageIsWon: stage?.is_won ?? false,
    stageIsLost: stage?.is_lost ?? false,
    funnel: l.funnel ?? "",
    nextFollowUp: formatFollowUp(l.next_follow_up),
    lastContact: timeAgo(l.last_contact_at),
    created: formatDate(l.created_at),
    createdAtIso: l.created_at,
    updated: timeAgo(l.updated_at),
    tags: l.tags ?? [],
    amocrmId: l.amocrm_id,
    aiCustomerProfile: (l.ai_customer_profile as StoredCustomerProfile | null) ?? null,
  };
}

// overrideLeads lets callers substitute a reconstructed "as of a past date"
// snapshot (see useAsOfSnapshot) in place of the live leads table, while
// still joining against the current contacts/profiles/stages for display
// names — the same shape either way.
export function useCrmLeads(overrideLeads?: LeadRow[], options?: { enabled?: boolean }) {
  const base = useCrmBase(options);
  const visibleOwnerIds = useVisibleOwnerIds();
  // base.leads is already scoped, but an as-of-date override comes straight
  // from the (unscoped) audit trail — apply the same ownership filter to it
  // too, so time-travelling doesn't bypass the "own data only" restriction.
  const sourceLeads = useMemo(() => {
    if (!overrideLeads) return base.leads;
    return visibleOwnerIds
      ? overrideLeads.filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
      : overrideLeads;
  }, [overrideLeads, base.leads, visibleOwnerIds]);

  const rows = useMemo<CrmLeadView[]>(() => {
    const contactsById = byId(base.contacts);
    const profilesById = byId(base.profiles);
    const stagesById = byId(base.stages);

    return sourceLeads.map((l) =>
      leadRowToView(
        l,
        l.contact_id ? contactsById.get(l.contact_id) : undefined,
        profilesById,
        stagesById,
      ),
    );
  }, [sourceLeads, base.contacts, base.profiles, base.stages]);

  return { rows, ...base };
}

/* ------------------------------------------------------------------ */
/* View: a single lead by id — fetched directly instead of pulling the */
/* whole org's leads (useCrmLeads) just to .find() one of them. On a   */
/* large AmoCRM account this turned "open any one lead" into the same  */
/* multi-minute full-table fetch as the leads register itself. Applies */
/* the same owner/team visibility rule as useCrmBase (JS-layer, since   */
/* the leads SELECT RLS policy itself is org-wide) so a rep still can't */
/* open a teammate's lead by guessing its URL.                          */
/* ------------------------------------------------------------------ */

export function useLeadById(leadId: string | undefined) {
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  const query = useQuery({
    queryKey: ["lead_detail", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<{ lead: LeadRow; contact: ContactRow | null } | null> => {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      if (!lead) return null;
      let contact: ContactRow | null = null;
      if (lead.contact_id) {
        const { data: c } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", lead.contact_id)
          .maybeSingle();
        contact = c ?? null;
      }
      return { lead, contact };
    },
  });

  const lead = useMemo<CrmLeadView | undefined>(() => {
    const row = query.data?.lead;
    if (!row) return undefined;
    if (visibleOwnerIds && (!row.owner_id || !visibleOwnerIds.has(row.owner_id))) return undefined;
    return leadRowToView(row, query.data?.contact, byId(profiles), byId(stages));
  }, [query.data, visibleOwnerIds, profiles, stages]);

  return { lead, isLoading: query.isLoading };
}

/* ------------------------------------------------------------------ */
/* View: the leads register, paginated server-side. The register used  */
/* to call useCrmLeads() (the whole org's leads) and render every row   */
/* into one <table> with no pagination at all — on an account with tens */
/* of thousands of leads that meant transferring the entire table AND   */
/* rendering tens of thousands of DOM rows, the real cause of the page  */
/* freezing for minutes. Only the current page's rows are fetched now;  */
/* the summary stat cards come from a small SQL aggregate (leads_list_  */
/* stats) instead of being reduced over every row client-side.          */
/* ------------------------------------------------------------------ */

export type LeadsListParams = {
  page: number;
  pageSize?: number;
  search?: string;
  stageId?: string | null;
  sortDesc?: boolean;
  // ISO timestamps -- filters by created_at. Only applied to the page
  // query itself; the stats aggregate (leads_list_stats) stays all-time
  // since that RPC's definition doesn't live in this repo's migrations
  // (delivered as raw SQL directly, same as entities_as_of) and adding a
  // date param to it blind, without its real current source, risks
  // silently breaking it.
  from?: string | null;
  to?: string | null;
};

type LeadsListStats = { total: number; hot: number; avgScore: number; revenue: number };

export function useLeadsListPage(params: LeadsListParams) {
  const { user } = useAuth();
  const pageSize = params.pageSize ?? 50;
  const search = params.search?.trim() || null;
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerScopeKey = visibleOwnerIds ? [...visibleOwnerIds].sort().join(",") : null;
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();

  const pageQuery = useQuery({
    queryKey: [
      "leads_list_page",
      user?.organizationId,
      params.page,
      pageSize,
      search,
      params.stageId ?? null,
      params.sortDesc ?? true,
      ownerScopeKey,
      params.from ?? null,
      params.to ?? null,
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadRow[]> => {
      const from = params.page * pageSize;
      let q = supabase.from("leads").select("*");
      if (params.stageId) q = q.eq("stage_id", params.stageId);
      if (search) q = q.or(`name.ilike.%${search}%,company_name.ilike.%${search}%`);
      if (visibleOwnerIds) q = q.in("owner_id", [...visibleOwnerIds]);
      if (params.from) q = q.gte("created_at", params.from);
      if (params.to) q = q.lte("created_at", params.to);
      q = q
        .order("score", { ascending: !(params.sortDesc ?? true) })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });

  const statsQuery = useQuery({
    queryKey: [
      "leads_list_stats",
      user?.organizationId,
      search,
      params.stageId ?? null,
      ownerScopeKey,
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadsListStats> => {
      const { data, error } = await supabase
        .rpc("leads_list_stats", {
          p_search: search,
          p_stage_id: params.stageId ?? null,
        })
        .maybeSingle();
      if (error) throw error;
      return {
        total: Number(data?.total ?? 0),
        hot: Number(data?.hot ?? 0),
        avgScore: Math.round(Number(data?.avg_score ?? 0)),
        revenue: Number(data?.revenue ?? 0),
      };
    },
  });

  const rows = useMemo<CrmLeadView[]>(() => {
    const stagesById = byId(stages);
    const profilesById = byId(profiles);
    return (pageQuery.data ?? []).map((l) => leadRowToView(l, undefined, profilesById, stagesById));
  }, [pageQuery.data, stages, profiles]);

  return {
    rows,
    stats: statsQuery.data ?? { total: 0, hot: 0, avgScore: 0, revenue: 0 },
    isLoading: pageQuery.isLoading || statsQuery.isLoading,
    isFetching: pageQuery.isFetching,
  };
}

/* ------------------------------------------------------------------ */
/* View: Pipeline board — one funnel's leads, fetched server-side      */
/* instead of pulling the whole organization's leads (useCrmBase) and  */
/* filtering client-side. Large AmoCRM accounts can have tens of       */
/* thousands of leads spread across dozens of funnels; loading all of  */
/* them just to show one funnel's Kanban board was the direct cause of */
/* the board never finishing "Pipeline yuklanmoqda...". contacts/      */
/* companies/deals aren't fetched at all here -- the board's cards only*/
/* need fields already denormalized onto leads (company_name, tags,    */
/* expected_revenue), not a contacts/companies join.                   */
/* ------------------------------------------------------------------ */

function usePipelineBoardLeadsRaw(funnel: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pipeline_board_leads", user?.organizationId, funnel],
    enabled: !!user?.organizationId && !!funnel,
    queryFn: async (): Promise<LeadRow[]> => {
      const fetchPage = async (from: number): Promise<LeadRow[]> => {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .eq("funnel", funnel!)
          .order("id", { ascending: true })
          .range(from, from + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as LeadRow[];
      };

      const all: LeadRow[] = [];
      let from = 0;
      let done = false;
      while (!done) {
        const starts = Array.from(
          { length: LIST_PAGE_CONCURRENCY },
          (_, i) => from + i * RESOURCE_PAGE_SIZE,
        );
        const pages = await Promise.all(starts.map(fetchPage));
        for (const page of pages) {
          all.push(...page);
          if (page.length < RESOURCE_PAGE_SIZE) done = true;
        }
        from += LIST_PAGE_CONCURRENCY * RESOURCE_PAGE_SIZE;
      }
      return all;
    },
  });
}

/** Same shape as useCrmLeads, scoped to a single funnel and fetched server-side — see the comment above usePipelineBoardLeadsRaw for why. */
export function usePipelineBoardLeads(funnel: string | null) {
  const board = usePipelineBoardLeadsRaw(funnel);
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  const scopedLeads = useMemo(() => {
    const leads = board.data ?? [];
    return visibleOwnerIds
      ? leads.filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
      : leads;
  }, [board.data, visibleOwnerIds]);

  // The board is already scoped to a single funnel (a bounded lead count),
  // unlike useCrmLeads' org-wide fetch this hook otherwise mirrors -- cheap
  // enough here to also resolve each lead's contact info, which used to be
  // left blank, silently breaking the filter bar's "search by phone"
  // promise on every page that reuses this hook's live-path leads
  // (Voronkalar's funnel detail view included, not just the AmoCRM board).
  const contactIds = useMemo(
    () =>
      Array.from(new Set(scopedLeads.map((l) => l.contact_id).filter((id): id is string => !!id))),
    [scopedLeads],
  );
  const { data: contacts } = useQuery({
    queryKey: ["pipeline_board_contacts", contactIds],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, phone, alt_phone, email, telegram, whatsapp")
        .in("id", contactIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const contactsById = useMemo(() => byId(contacts ?? []), [contacts]);

  const rows = useMemo<CrmLeadView[]>(() => {
    const profilesById = byId(profiles ?? []);
    const stagesById = byId(stages ?? []);

    return scopedLeads.map((l): CrmLeadView => {
      const owner = l.owner_id ? profilesById.get(l.owner_id) : undefined;
      const manager = l.manager_id ? profilesById.get(l.manager_id) : undefined;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const contact = l.contact_id ? contactsById.get(l.contact_id) : undefined;
      return {
        id: l.id,
        name: l.name,
        initials: initialsOf(l.name),
        company: l.company_name,
        companyId: l.company_id ?? "",
        position: "",
        phone: contact?.phone ?? "",
        altPhone: contact?.alt_phone ?? "",
        email: contact?.email ?? "",
        telegram: contact?.telegram ?? "",
        whatsapp: contact?.whatsapp ?? "",
        source: l.source ?? "",
        campaign: l.campaign ?? "",
        utm: l.utm ?? "",
        owner: owner ? profileName(owner) : "Unassigned",
        ownerId: l.owner_id ?? "",
        manager: manager ? profileName(manager) : "—",
        priority: l.priority,
        score: l.score,
        temperature: l.temperature,
        budget: l.budget,
        expectedRevenue: l.expected_revenue,
        country: l.country ?? "",
        region: l.region ?? "",
        city: l.city ?? "",
        address: l.address ?? "",
        stage: stage?.name ?? "New Lead",
        stageId: l.stage_id ?? "",
        stageIsWon: stage?.is_won ?? false,
        stageIsLost: stage?.is_lost ?? false,
        funnel: l.funnel ?? "",
        nextFollowUp: formatFollowUp(l.next_follow_up),
        lastContact: timeAgo(l.last_contact_at),
        created: formatDate(l.created_at),
        createdAtIso: l.created_at,
        updated: timeAgo(l.updated_at),
        tags: l.tags ?? [],
        amocrmId: l.amocrm_id,
        aiCustomerProfile: (l.ai_customer_profile as StoredCustomerProfile | null) ?? null,
      };
    });
  }, [scopedLeads, profiles, stages, contactsById]);

  return {
    rows,
    stages: stages ?? [],
    isLoading: board.isLoading || !stages || !profiles,
    isError: board.isError,
  };
}

// Several Dashboard hooks (funnel KPI cards, Sotuv tahlili, Yo'qotish
// sabablari, Sotuv dinamikasi, Konversiya sifati) used to call useLeadsRaw()
// unconditionally and filter by funnel client-side -- the exact full-org
// fetch the comment above usePipelineBoardLeadsRaw already identified as
// the cause of the Pipeline board never finishing on a large AmoCRM account.
// Once a funnel is picked, these showed 0 (the fetch was still resolving)
// even though the same funnel's leads were already visible instantly on
// Voronkalar, which reads via that funnel-scoped server query. Reuse it
// here too: fetch only this funnel's leads server-side when one is
// selected, and only fall back to the full org-wide fetch when none is.
function useFunnelScopedLeads(
  funnel: string | null,
  enabled = true,
): {
  data: LeadRow[] | undefined;
  isLoading: boolean;
} {
  const scoped = usePipelineBoardLeadsRaw(enabled ? funnel : null);
  const all = useLeadsRaw({ enabled: enabled && !funnel });
  // Every Dashboard chart built on this hook (Sotuv tahlili's per-owner
  // revenue bars, monthly trend, loss reasons, deal flow, conversion
  // quality) was reading org-wide/whole-funnel leads with no owner
  // filter -- unlike usePipelineBoardLeads (the Funnels/AmoCRM board's own
  // version of this exact fetch), which already applies this. A rep
  // opening Dashboard saw every colleague's name and revenue on the
  // "Sotuv tahlili" chart specifically.
  const visibleOwnerIds = useVisibleOwnerIds();
  const rawData = funnel ? scoped.data : all.data;
  const data = useMemo(() => {
    if (!rawData) return rawData;
    return visibleOwnerIds
      ? rawData.filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
      : rawData;
  }, [rawData, visibleOwnerIds]);
  return funnel ? { data, isLoading: scoped.isLoading } : { data, isLoading: all.isLoading };
}

/* ------------------------------------------------------------------ */
/* View: Funnels list -- one row per funnel, aggregated server-side.   */
/* The /funnels page (no funnel selected) used to pull the whole org's */
/* leads via useCrmLeads() just to group them into cards -- same full- */
/* table problem as everywhere else on a large AmoCRM account.         */
/* ------------------------------------------------------------------ */

export type FunnelStat = {
  name: string;
  count: number;
  value: number;
  won: number;
  hot: number;
  warm: number;
  cold: number;
  // "Conversion" here matches the same late-funnel definition the funnel
  // detail view uses (leads that reached a sales/late-funnel stage, not
  // just the strictly-won ones) -- see funnels.tsx's lateFunnelConversionRate
  // and SALES_STAGE_KEYWORDS below. The list cards and the detail view used
  // to disagree (cards showed won/total, detail showed late-funnel/total)
  // under the same "konversiya" label, which read as a bug.
  conversion: number;
};

export function useFunnelListStats(enabled = true) {
  const { user } = useAuth();
  const enabledFunnels = useEnabledFunnelNames();
  const query = useQuery({
    queryKey: ["funnel_list_stats", user?.organizationId],
    enabled: enabled && !!user?.organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("funnel_list_stats");
      if (error) throw error;
      return data ?? [];
    },
  });

  const funnels = useMemo<FunnelStat[]>(
    () =>
      (query.data ?? [])
        .filter((r) => !enabledFunnels || enabledFunnels.has(r.funnel))
        .map((r): FunnelStat => {
          const count = Number(r.total);
          const lateFunnel = Number(r.late_funnel);
          return {
            name: r.funnel,
            count,
            value: Number(r.value),
            won: Number(r.won),
            hot: Number(r.hot),
            warm: Number(r.warm),
            cold: Number(r.cold),
            conversion: count ? Math.round((lateFunnel / count) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.count - a.count),
    [query.data, enabledFunnels],
  );

  return { funnels, isLoading: query.isLoading };
}

/* ------------------------------------------------------------------ */
/* View: Leaderboard (real per-manager performance, not simulated)     */
/* ------------------------------------------------------------------ */

export type LeaderboardFilters = {
  from: string | null;
  to: string | null;
  search: string;
  stageId: string | null;
  funnel: string | null;
  tags: string[];
};

export type LeaderboardManagerRow = {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  revenue: number;
  conversion: number;
  kpiPercent: number;
  monthlyTarget: number | null;
  targetCompletion: number;
};

type LeaderboardOwnerStats = { total: number; won: number; lost: number; revenue: number };

// Live path (the overwhelming majority of calls, including the 3s "live"
// poll on the Reyting landing page) used to re-fetch the whole org's leads
// table -- tens of thousands of rows on a large AmoCRM account -- on every
// poll tick, forever, for as long as the tab stayed open. leaderboard_stats
// computes the same per-owner totals in Postgres and returns one row per
// rep instead. The as-of-date override path (opts.overrideLeads) still
// reduces client-side, since that snapshot only exists in memory (it comes
// from the audit trail, not the live table) and is small by nature.
export function useLeaderboardView(
  filters: LeaderboardFilters,
  opts?: { refetchInterval?: number | false; overrideLeads?: LeadRow[] | undefined },
) {
  const refetchInterval = opts?.refetchInterval ?? false;
  const useOverride = !!opts?.overrideLeads;

  const {
    data: profiles,
    isLoading: profilesLoading,
    isFetching: profilesFetching,
    refetch: refetchProfiles,
  } = useProfilesRaw({ refetchInterval });
  const {
    data: stages,
    isLoading: stagesLoading,
    isFetching: stagesFetching,
    refetch: refetchStages,
  } = usePipelineStagesRaw({ refetchInterval });
  const stagesById = useMemo(() => byId(stages), [stages]);

  const tagsKey = filters.tags.length ? [...filters.tags].sort().join(",") : "";
  const statsQuery = useQuery({
    queryKey: [
      "leaderboard_stats",
      filters.from,
      filters.to,
      filters.funnel,
      filters.stageId,
      tagsKey,
    ],
    enabled: !useOverride,
    refetchInterval: useOverride ? false : refetchInterval,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard_stats", {
        p_from: filters.from,
        p_to: filters.to,
        p_funnel: filters.funnel,
        p_stage_id: filters.stageId,
        p_tags: filters.tags.length ? filters.tags : null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredOverrideLeads = useMemo(() => {
    if (!useOverride) return [];
    return (opts?.overrideLeads ?? []).filter((l) => {
      if (filters.from && l.created_at < filters.from) return false;
      if (filters.to && l.created_at > filters.to) return false;
      if (filters.stageId && l.stage_id !== filters.stageId) return false;
      if (filters.funnel && (l.funnel || "Direct Sales") !== filters.funnel) return false;
      if (filters.tags.length > 0 && !filters.tags.some((tag) => (l.tags ?? []).includes(tag)))
        return false;
      return true;
    });
  }, [
    useOverride,
    opts?.overrideLeads,
    filters.from,
    filters.to,
    filters.stageId,
    filters.funnel,
    filters.tags,
  ]);

  const statsByOwner = useMemo(() => {
    const map = new Map<string, LeaderboardOwnerStats>();
    if (useOverride) {
      for (const l of filteredOverrideLeads) {
        if (!l.owner_id) continue;
        const entry = map.get(l.owner_id) ?? { total: 0, won: 0, lost: 0, revenue: 0 };
        entry.total += 1;
        const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
        if (stage?.is_won) {
          entry.won += 1;
          entry.revenue += l.expected_revenue;
        }
        if (stage?.is_lost) entry.lost += 1;
        map.set(l.owner_id, entry);
      }
    } else {
      for (const r of statsQuery.data ?? []) {
        map.set(r.owner_id, {
          total: Number(r.total_leads),
          won: Number(r.won_leads),
          lost: Number(r.lost_leads),
          revenue: Number(r.revenue),
        });
      }
    }
    return map;
  }, [useOverride, filteredOverrideLeads, stagesById, statsQuery.data]);

  const isLoading = useOverride
    ? profilesLoading || stagesLoading
    : profilesLoading || stagesLoading || statsQuery.isLoading;
  const isFetching = useOverride
    ? profilesFetching || stagesFetching
    : profilesFetching || stagesFetching || statsQuery.isFetching;
  const refetch = () =>
    Promise.all([refetchProfiles(), refetchStages(), useOverride ? null : statsQuery.refetch()]);

  const rows = useMemo<LeaderboardManagerRow[]>(() => {
    const q = filters.search.trim().toLowerCase();
    const eligible = (profiles ?? []).filter(
      (p) =>
        p.role !== "super_admin" &&
        p.role !== "platform_owner" &&
        p.role !== "rop" &&
        (!q || profileName(p).toLowerCase().includes(q)),
    );
    return eligible
      .map((p): LeaderboardManagerRow => {
        const s = statsByOwner.get(p.id) ?? { total: 0, won: 0, lost: 0, revenue: 0 };
        const conversion = s.total ? (s.won / s.total) * 100 : 0;
        const targetCompletion =
          p.monthly_target && p.monthly_target > 0 ? (s.revenue / p.monthly_target) * 100 : 0;
        return {
          id: p.id,
          name: profileName(p),
          initials: initialsOf(profileName(p)),
          avatarUrl: p.avatar_url,
          totalLeads: s.total,
          wonLeads: s.won,
          lostLeads: s.lost,
          revenue: s.revenue,
          conversion,
          kpiPercent: p.kpi_percent,
          monthlyTarget: p.monthly_target,
          targetCompletion,
        };
      })
      .filter((row) => !filters.funnel || row.totalLeads > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [profiles, statsByOwner, filters.search, filters.funnel]);

  return {
    rows,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt: statsQuery.dataUpdatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* View: Audio Analytics (real AmoCRM call activity). Transcript + AI       */
/* summary are populated on demand via useAnalyzeCall(), which needs        */
/* GEMINI_API_KEY set (both transcription and scoring use it).             */
/* ------------------------------------------------------------------ */

export type CallChecklistItem = {
  stage: string;
  step: string;
  skill: string | null;
  points: number;
  met: boolean;
  note: string;
  // Absent on calls analyzed before timestamped transcripts were added --
  // always optional so old amocrm_calls.analysis rows still parse.
  timestamp?: string | null;
};

export type ServiceStandardCheck = {
  name: string;
  violated: boolean;
  evidence: string;
};

export type CallAgreement = { text: string; timestamp: string | null };
export type CallQuote = { text: string; speaker: string | null; timestamp: string | null };
export type CallImprovement = { title: string; description: string; suggestion: string };

export type CallSentimentPoint = { timestamp: string; sentiment: string };
export type CallKeyTopic = { topic: string; count: number };

export type CallAnalysis = {
  checklist: CallChecklistItem[];
  strengths: string[];
  // A call analyzed before the richer format shipped stored these as plain
  // string[] -- both shapes can appear in already-saved rows, so every
  // reader normalizes via asAgreement()/asQuote()/asImprovement() in
  // CallAnalysisDetail rather than trusting this type alone.
  improvements: (string | CallImprovement)[];
  warnings: string[];
  risks: string[];
  agreements: (string | CallAgreement)[];
  keyQuotes: (string | CallQuote)[];
  topObjections: string[];
  serviceStandards: ServiceStandardCheck[];
  // Absent on calls analyzed before this batch of analytics shipped --
  // always optional so old amocrm_calls.analysis rows still parse.
  sentimentTimeline?: CallSentimentPoint[];
  keyTopics?: CallKeyTopic[];
  // Which "Qo'ng'iroq oilasi" (call_categories row) the AI classified this
  // call into, if the org has any configured. scored: false means this
  // family is excluded from the sales rubric (e.g. an unconnected call or a
  // payment follow-up) -- score is null on that call for the same reason.
  callFamily?: { name: string; scored: boolean; exclusionReason: string | null } | null;
};

export type AudioCallView = {
  id: string;
  leadId: string | null;
  leadName: string;
  company: string;
  owner: string;
  ownerId: string | null;
  funnel: string | null;
  stage: string | null;
  phone: string;
  direction: "in" | "out";
  connected: boolean;
  durationSeconds: number;
  recordingUrl: string | null;
  occurredAt: string;
  occurredAtRaw: string;
  transcript: string | null;
  aiSummary: string | null;
  nextStep: string | null;
  amocrmTaskId: number | null;
  aiNoteId: number | null;
  amocrmId: number | null;
  score: number | null;
  mood: string | null;
  talkRatio: number | null;
  analysis: CallAnalysis | null;
};

export type RecoverableLeadView = {
  id: string;
  name: string;
  company: string;
  owner: string;
  tags: string[];
  lastCallAt: string;
  connectedCalls: number;
  amocrmId: number | null;
};

type AudioLeadLite = {
  id: string;
  name: string;
  company: string;
  ownerId: string;
  owner: string;
  funnel: string;
  stage: string;
  tags: string[];
  amocrmId: number | null;
};

export function useAudioAnalyticsView(
  range: { from: Date | null; to: Date | null } | null,
  overrideCalls?: AmoCrmCallRow[],
) {
  const { user } = useAuth();
  const { data: liveCalls, isLoading: callsLoading } = useAmoCrmCallsSince(range, {
    enabled: !overrideCalls,
  });
  // Only the handful of display fields below (name/company/owner/funnel/
  // stage/tags) are needed here — useCrmLeads() used to pull this via
  // useCrmBase, which also fetched every company and contact in the org
  // (unused on this page) plus ran the full CrmLeadView join per lead. On a
  // large AmoCRM account that made "open Audio tahlil" pay the same
  // multi-thousand-row cost as the leads register itself. Build the lookup
  // straight from the lighter raw tables instead.
  const { data: rawLeads, isLoading: rawLeadsLoading } = useLeadsRaw();
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const isLoading = callsLoading || rawLeadsLoading || profilesLoading || stagesLoading;

  const leads = useMemo<AudioLeadLite[]>(() => {
    const profilesById = byId(profiles);
    const stagesById = byId(stages);
    const scoped = visibleOwnerIds
      ? (rawLeads ?? []).filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
      : (rawLeads ?? []);
    return scoped.map((l) => {
      const owner = l.owner_id ? profilesById.get(l.owner_id) : undefined;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      return {
        id: l.id,
        name: l.name,
        company: l.company_name,
        ownerId: l.owner_id ?? "",
        owner: owner ? profileName(owner) : "Unassigned",
        funnel: l.funnel ?? "",
        stage: stage?.name ?? "New Lead",
        tags: l.tags ?? [],
        amocrmId: l.amocrm_id,
      };
    });
  }, [rawLeads, profiles, stages, visibleOwnerIds]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  // leads (from useCrmLeads) are already scoped to what this user may see —
  // a call whose lead isn't in that map belongs to someone else's lead and
  // must be hidden too (call metadata, recordings and transcripts included).
  // A call with no lead_id at all (a manual log) is only visible to whoever
  // created it, for the same roles.
  const calls = useMemo(() => {
    const rows = overrideCalls ?? liveCalls ?? [];
    if (!user) return [];
    if (user.role === "super_admin" || user.role === "platform_owner") return rows;
    return rows.filter((c) => (c.lead_id ? leadsById.has(c.lead_id) : c.created_by === user.id));
  }, [overrideCalls, liveCalls, leadsById, user]);

  const recent = useMemo<AudioCallView[]>(
    () =>
      (calls ?? []).map((c) => {
        const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
        return {
          id: c.id,
          leadId: c.lead_id,
          leadName: lead?.name ?? "",
          company: lead?.company ?? "",
          owner: lead?.owner ?? "",
          ownerId: lead?.ownerId ?? null,
          // Leads with no funnel set display as "Direct Sales" everywhere
          // else (funnel dropdown, LeadFilterBar) — match that fallback here
          // too, or a call attached to one of those leads never matches the
          // "Direct Sales" filter option and silently vanishes from results.
          funnel: lead ? lead.funnel || "Direct Sales" : null,
          stage: lead?.stage ?? null,
          // A lead's own phone lives on its linked contact, which this view
          // no longer fetches (see the lite-lookup comment above) — fall
          // back to the call's own phone only.
          phone: c.phone ?? "",
          direction: c.direction === "in" ? "in" : "out",
          connected: c.connected,
          durationSeconds: c.duration_seconds,
          recordingUrl: c.recording_url,
          occurredAt: timeAgo(c.occurred_at),
          occurredAtRaw: c.occurred_at,
          transcript: c.transcript,
          aiSummary: c.ai_summary,
          nextStep: c.next_step,
          amocrmTaskId: c.amocrm_task_id,
          aiNoteId: c.ai_note_id,
          amocrmId: lead?.amocrmId ?? null,
          score: c.score,
          mood: c.mood,
          talkRatio: c.talk_ratio,
          analysis: (c.analysis as CallAnalysis | null) ?? null,
        };
      }),
    [calls, leadsById],
  );

  const totals = useMemo(() => {
    const total = calls?.length ?? 0;
    const connected = (calls ?? []).filter((c) => c.connected).length;
    const totalDuration = (calls ?? []).reduce((s, c) => s + c.duration_seconds, 0);
    const avgDuration = total ? Math.round(totalDuration / total) : 0;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const callsToday = (calls ?? []).filter((c) => new Date(c.occurred_at) >= startOfToday).length;
    return {
      total,
      connected,
      connectionRate: total ? Math.round((connected / total) * 1000) / 10 : 0,
      avgDuration,
      callsToday,
    };
  }, [calls]);

  const perRep = useMemo(() => {
    const map = new Map<
      string,
      { name: string; calls: number; connected: number; duration: number }
    >();
    // Seed every rep who owns at least one visible lead first, so a rep with
    // zero calls synced yet still shows up (at 0) instead of silently
    // disappearing from the breakdown.
    for (const l of leads) {
      if (!l.ownerId) continue;
      if (!map.has(l.ownerId)) {
        map.set(l.ownerId, { name: l.owner, calls: 0, connected: 0, duration: 0 });
      }
    }
    for (const c of calls ?? []) {
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      const key = lead?.ownerId || "unknown";
      const name = lead?.owner || "—";
      if (!map.has(key)) map.set(key, { name, calls: 0, connected: 0, duration: 0 });
      const row = map.get(key)!;
      row.calls += 1;
      if (c.connected) row.connected += 1;
      row.duration += c.duration_seconds;
    }
    return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
  }, [calls, leadsById, leads]);

  const recoverable = useMemo<RecoverableLeadView[]>(() => {
    const callsByLead = new Map<string, AmoCrmCallRow[]>();
    for (const c of calls ?? []) {
      if (!c.lead_id) continue;
      if (!callsByLead.has(c.lead_id)) callsByLead.set(c.lead_id, []);
      callsByLead.get(c.lead_id)!.push(c);
    }
    return leads
      .filter((l) => l.stage === "Lost")
      .map((l) => {
        const leadCalls = callsByLead.get(l.id) ?? [];
        const connectedCalls = leadCalls.filter((c) => c.connected).length;
        const last = [...leadCalls].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        )[0];
        return {
          id: l.id,
          name: l.name,
          company: l.company,
          owner: l.owner,
          tags: l.tags,
          lastCallAt: last ? timeAgo(last.occurred_at) : "",
          connectedCalls,
          amocrmId: l.amocrmId,
        };
      })
      .filter((l) => l.connectedCalls > 0)
      .sort((a, b) => b.connectedCalls - a.connectedCalls)
      .slice(0, 10);
  }, [leads, calls]);

  return { recent, totals, perRep, recoverable, isLoading };
}

export type AlertStateRow = Tables["alert_states"]["Row"];

export type AlertType = "manager_inactive" | "no_audio" | "low_quality" | "red_flag";

export type AlertView = {
  key: string;
  type: AlertType;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
  dismissed: boolean;
};

function useAlertStatesRaw() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["alert_states", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AlertStateRow[]> => {
      const { data, error } = await supabase.from("alert_states").select("*");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

// Ogohlantirishlar (operational alerts): unlike notifications, these aren't
// rows someone inserted -- they're facts computed live from amocrm_calls and
// profiles (a rep with zero calls today, a call with no recording, a
// low-scored call, an AI-flagged deal-loss risk), so they can never go stale
// or need a backfill. Only "read"/"dismissed" is real per-admin state, kept
// in alert_states and merged in below by the same alert_key both sides
// agree on.
export function useAlertsView() {
  // This account's AmoCRM history is still backfilling, so most calls
  // landing in the DB today have an old real occurred_at (from months back,
  // not from today) -- a narrow 7-day window filtered nearly all of them
  // out and made the page look almost empty. 90 days surfaces the actual
  // backlog of real issues instead of just whatever happened this week.
  const ALERT_WINDOW_DAYS = 90;
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ALERT_WINDOW_DAYS);
    return d;
  }, []);
  const { data: calls, isLoading: callsLoading } = useAmoCrmCallsSince({ from, to: null });
  const { data: leads, isLoading: leadsLoading } = useLeadsRaw();
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  const { data: states, isLoading: statesLoading } = useAlertStatesRaw();
  const isLoading = callsLoading || leadsLoading || profilesLoading || statesLoading;

  const alerts = useMemo<AlertView[]>(() => {
    const leadsById = byId(leads);
    const profilesById = byId(profiles);
    const out: AlertView[] = [];

    // Faoliyatsiz menejer -- a rep who owns at least one lead (so they're an
    // active seller, not e.g. a brand-new hire with nothing assigned yet)
    // but made zero calls in the last 24 hours.
    const ownerIdsWithLeads = new Set(
      (leads ?? []).filter((l) => !!l.owner_id).map((l) => l.owner_id as string),
    );
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const callsLast24hByOwner = new Set<string>();
    for (const c of calls ?? []) {
      if (new Date(c.occurred_at).getTime() < dayAgo) continue;
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      if (lead?.owner_id) callsLast24hByOwner.add(lead.owner_id);
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const ownerId of ownerIdsWithLeads) {
      if (callsLast24hByOwner.has(ownerId)) continue;
      const rep = profilesById.get(ownerId);
      if (!rep || (rep.role !== "rep" && rep.role !== "sotuv_menejeri")) continue;
      out.push({
        key: `manager_inactive:${ownerId}:${today}`,
        type: "manager_inactive",
        title: `${profileName(rep)} so'nggi 24 soatda qo'ng'iroq qilmagan`,
        body: "Faoliyatini tekshiring — bugun hech qanday qo'ng'iroq amalga oshirilmadi.",
        link: "/audio-analytics",
        createdAt: new Date().toISOString(),
        read: false,
        dismissed: false,
      });
    }

    for (const c of calls ?? []) {
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      const leadLink = lead ? `/crm/leads/${lead.id}` : null;
      const ownerName = lead?.owner_id ? profileName(profilesById.get(lead.owner_id)) : null;
      const who = ownerName ? ` (${ownerName})` : "";

      // Audio yo'q -- a connected call with no recording ever landed.
      if (c.connected && !c.recording_url) {
        out.push({
          key: `no_audio:${c.id}`,
          type: "no_audio",
          title: `${lead?.name ?? "Noma'lum lid"}${who} bilan qo'ng'iroqning audiosi yo'q`,
          body: "AmoCRM'dan yozuv fayli kelmadi — qo'ng'iroq ulangan bo'lsa ham audio topilmadi.",
          link: leadLink,
          createdAt: c.occurred_at,
          read: false,
          dismissed: false,
        });
      }

      // Past sifatli qo'ng'iroq -- AI baholagan, past ball bilan.
      if (c.score != null && c.score < 40) {
        out.push({
          key: `low_quality:${c.id}`,
          type: "low_quality",
          title: `${lead?.name ?? "Noma'lum lid"}${who} bilan past sifatli qo'ng'iroq`,
          body: `AI bahosi: ${c.score}/100. Qo'ng'iroqni tinglab, sababini aniqlang.`,
          link: leadLink,
          createdAt: c.occurred_at,
          read: false,
          dismissed: false,
        });
      }

      // Red Flag xatosi -- AI tahlili bitim yo'qolish xavfini aniqlagan.
      const risks = (c.analysis as CallAnalysis | null)?.risks;
      if (risks && risks.length > 0) {
        out.push({
          key: `red_flag:${c.id}`,
          type: "red_flag",
          title: `${lead?.name ?? "Noma'lum lid"}${who} bo'yicha bitim yo'qolish xavfi`,
          body: risks[0] ?? "",
          link: leadLink,
          createdAt: c.occurred_at,
          read: false,
          dismissed: false,
        });
      }
    }

    const stateByKey = new Map((states ?? []).map((s) => [s.alert_key, s]));
    return out
      .map((a) => {
        const s = stateByKey.get(a.key);
        return { ...a, read: !!s?.read_at, dismissed: !!s?.dismissed_at };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [calls, leads, profiles, states]);

  return { alerts, isLoading };
}

function useUpsertAlertState() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { key: string; readAt?: string; dismissedAt?: string }) => {
      const { error } = await supabase.from("alert_states").upsert(
        {
          organization_id: user!.organizationId!,
          user_id: user!.id,
          alert_key: input.key,
          ...(input.readAt ? { read_at: input.readAt } : {}),
          ...(input.dismissedAt ? { dismissed_at: input.dismissedAt } : {}),
        },
        { onConflict: "user_id,alert_key", ignoreDuplicates: false },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["alert_states", user?.id] }),
  });
}

export function useMarkAlertRead() {
  const upsert = useUpsertAlertState();
  return {
    ...upsert,
    mutate: (key: string, options?: Parameters<(typeof upsert)["mutate"]>[1]) =>
      upsert.mutate({ key, readAt: new Date().toISOString() }, options),
  };
}

export function useDismissAlert() {
  const upsert = useUpsertAlertState();
  return {
    ...upsert,
    mutate: (key: string, options?: Parameters<(typeof upsert)["mutate"]>[1]) =>
      upsert.mutate(
        { key, readAt: new Date().toISOString(), dismissedAt: new Date().toISOString() },
        options,
      ),
  };
}

// A small, cheap preview for widgets (Dashboard's Audio tahlil card) that
// only need "the last few AI-scored calls" — not the full useAudioAnalyticsView
// (every call, every column, for the whole org). Filtering server-side on
// score IS NOT NULL keeps this to the small analyzed subset instead of the
// whole calls table.
export type RecentAnalyzedCall = {
  id: string;
  leadId: string | null;
  leadName: string;
  score: number;
  mood: string | null;
  nextStep: string | null;
  occurredAt: string;
};

type CallScorePreviewRow = {
  id: string;
  lead_id: string | null;
  occurred_at: string;
  score: number | null;
  mood: string | null;
  next_step: string | null;
};

export function useRecentAnalyzedCalls(funnel: string | null, limit = 5) {
  const { user } = useAuth();
  const { data: leads } = useLeadsRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const leadsById = useMemo(() => byId(leads), [leads]);

  const needsScoping = !!funnel || !!visibleOwnerIds;
  const scopedLeadIds = useMemo(() => {
    if (!needsScoping) return null;
    return (leads ?? [])
      .filter((l) => {
        if (funnel && (l.funnel || "Direct Sales") !== funnel) return false;
        if (visibleOwnerIds && (!l.owner_id || !visibleOwnerIds.has(l.owner_id))) return false;
        return true;
      })
      .map((l) => l.id);
  }, [leads, funnel, visibleOwnerIds, needsScoping]);
  const scopeKey = scopedLeadIds ? scopedLeadIds.slice().sort().join(",") : null;

  const query = useQuery({
    queryKey: ["recent-analyzed-calls", limit, funnel ?? null, scopeKey],
    enabled: !!user && (!needsScoping || leads !== undefined),
    queryFn: async (): Promise<CallScorePreviewRow[]> => {
      if (scopedLeadIds && scopedLeadIds.length === 0) return [];
      let q = supabase
        .from("amocrm_calls")
        .select("id, lead_id, occurred_at, score, mood, next_step")
        .not("score", "is", null);
      if (scopedLeadIds) q = q.in("lead_id", scopedLeadIds);
      const { data, error } = await q.order("occurred_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as CallScorePreviewRow[];
    },
  });

  const rows = useMemo<RecentAnalyzedCall[]>(
    () =>
      (query.data ?? []).map((c) => ({
        id: c.id,
        leadId: c.lead_id,
        leadName: (c.lead_id ? leadsById.get(c.lead_id)?.name : null) ?? "—",
        score: c.score!,
        mood: c.mood,
        nextStep: c.next_step,
        occurredAt: timeAgo(c.occurred_at),
      })),
    [query.data, leadsById],
  );

  return { rows, isLoading: query.isLoading };
}

/* ------------------------------------------------------------------ */
/* View: Companies                                                     */
/* ------------------------------------------------------------------ */

export type CompanyView = {
  id: string;
  name: string;
  initials: string;
  industry: string;
  employees: string;
  revenue: number;
  website: string;
  city: string;
  owner: string;
  contacts: number;
  createdAtRaw: string;
};

export function useCompaniesView() {
  const base = useCrmBase();

  const rows = useMemo<CompanyView[]>(() => {
    const profilesById = byId(base.profiles);
    return base.companies.map((c): CompanyView => {
      const contactCount = base.contacts.filter((ct) => ct.company_id === c.id).length;
      const owner = c.owner_id ? profilesById.get(c.owner_id) : undefined;
      return {
        id: c.id,
        name: c.name,
        initials: initialsOf(c.name),
        industry: c.industry ?? "",
        employees: c.employees_range ?? "",
        revenue: Number(c.annual_revenue ?? 0),
        website: c.website ?? "",
        city: c.city ?? "",
        owner: owner ? profileName(owner) : "Unassigned",
        contacts: contactCount,
        createdAtRaw: c.created_at,
      };
    });
  }, [base.companies, base.contacts, base.profiles]);

  return { rows, ...base };
}

/* ------------------------------------------------------------------ */
/* View: Contacts                                                      */
/* ------------------------------------------------------------------ */

export type ContactView = {
  id: string;
  name: string;
  initials: string;
  position: string;
  company: string;
  companyId: string;
  phone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  birthday: string;
  tasks: number;
  createdAtRaw: string;
};

export function useContactsView() {
  const base = useCrmBase();

  const rows = useMemo<ContactView[]>(() => {
    const companiesById = byId(base.companies);
    return base.contacts.map((ct): ContactView => {
      const company = ct.company_id ? companiesById.get(ct.company_id) : undefined;
      const leadIds = new Set(base.leads.filter((l) => l.contact_id === ct.id).map((l) => l.id));
      return {
        id: ct.id,
        name: ct.full_name,
        initials: initialsOf(ct.full_name),
        position: ct.position ?? "",
        company: company?.name ?? "",
        companyId: ct.company_id ?? "",
        phone: ct.phone ?? "",
        email: ct.email ?? "",
        telegram: ct.telegram ?? "",
        whatsapp: ct.whatsapp ?? "",
        birthday: ct.birthday ? formatDate(ct.birthday) : "—",
        tasks: leadIds.size,
        createdAtRaw: ct.created_at,
      };
    });
  }, [base.contacts, base.companies, base.leads]);

  return { rows, ...base };
}

/* ------------------------------------------------------------------ */
/* View: Tasks (Important Tasks + Lead Tasks share the same table)     */
/* ------------------------------------------------------------------ */

export type TaskView = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  assigneeId: string;
  priority: TaskRow["priority"];
  status: TaskRow["status"];
  due: string;
  dueRaw: string | null;
  progress: number;
  leadId: string | null;
  leadName: string | null;
  // null when the task has no linked lead (e.g. Important Tasks' general,
  // non-lead-specific items) — those are funnel-agnostic by definition.
  funnel: string | null;
};

export function useTasksView(overrideTasks?: TaskRow[]) {
  const tasks = useTasksRaw();
  const profiles = useProfilesRaw();
  const leads = useLeadsRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const sourceTasks = useMemo(() => {
    const rows = overrideTasks ?? tasks.data ?? [];
    return visibleOwnerIds
      ? rows.filter((t) => t.assignee_id && visibleOwnerIds.has(t.assignee_id))
      : rows;
  }, [overrideTasks, tasks.data, visibleOwnerIds]);

  const rows = useMemo<TaskView[]>(() => {
    const profilesById = byId(profiles.data);
    const leadsById = byId(leads.data);
    return (sourceTasks ?? []).map((t): TaskView => {
      const assignee = t.assignee_id ? profilesById.get(t.assignee_id) : undefined;
      const lead = t.lead_id ? leadsById.get(t.lead_id) : undefined;
      return {
        id: t.id,
        title: t.title,
        description: t.description ?? "",
        assignee: assignee ? profileName(assignee) : "Unassigned",
        assigneeId: t.assignee_id ?? "",
        priority: t.priority,
        status: t.status,
        due: formatFollowUp(t.due_date),
        dueRaw: t.due_date,
        progress: t.progress,
        leadId: t.lead_id,
        leadName: lead?.name ?? null,
        funnel: lead ? lead.funnel || "Direct Sales" : null,
      };
    });
  }, [sourceTasks, profiles.data, leads.data]);

  return {
    rows,
    isLoading: tasks.isLoading || profiles.isLoading || leads.isLoading,
    isError: tasks.isError || profiles.isError || leads.isError,
  };
}

/* ------------------------------------------------------------------ */
/* View: Notifications (Inbox)                                         */
/* ------------------------------------------------------------------ */

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  unread: boolean;
  meta: string;
  link: string | null;
};

export function useNotificationsView() {
  const q = useNotificationsRaw();
  const rows = useMemo<NotificationView[]>(
    () =>
      (q.data ?? []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body ?? "",
        unread: !n.read,
        meta: timeAgo(n.created_at),
        link: n.link,
      })),
    [q.data],
  );
  return { rows, isLoading: q.isLoading, isError: q.isError };
}

/* ------------------------------------------------------------------ */
/* Dashboard aggregates — KPIs, revenue series, pipeline & funnel       */
/* stats and recent activity, all computed from real CRM rows.         */
/* ------------------------------------------------------------------ */

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Used to read `deals`, which this AmoCRM-synced setup never populates
// (leads carry the real revenue) -- so this chart permanently showed a flat
// $0 line for every AmoCRM org. Rebuilt on leads + pipeline_stages, same
// source and "won"/"lost"/"open" resolution as useSalesAnalyticsSummary.
export function useRevenueSeries() {
  const { data: leads } = useLeadsRaw();
  const { data: stages } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  return useMemo(() => {
    const stagesById = byId(stages);
    const rows = visibleOwnerIds
      ? (leads ?? []).filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
      : (leads ?? []);
    const now = new Date();
    const months: { label: string; revenue: number; pipeline: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let revenue = 0;
      let pipeline = 0;
      for (const l of rows) {
        if (monthKey(l.created_at) !== key) continue;
        const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
        if (stage?.is_won) revenue += l.expected_revenue;
        else if (!stage?.is_lost) pipeline += l.expected_revenue;
      }
      months.push({ label: MONTH_LABELS[d.getMonth()]!, revenue, pipeline });
    }
    return months;
  }, [leads, stages, visibleOwnerIds]);
}

export type SalesAnalyticsSummary = {
  forecast: number;
  ytdRevenue: number;
  ytdDelta: number;
  avgDealSize: number;
  lossRate: number;
  lossRateDelta: number;
  monthlyTrend: { label: string; revenue: number }[];
  perOwner: { name: string; revenue: number }[];
};

// Real-data replacement for the old static "Sales Analytics" mock page --
// same four headline numbers and two charts, computed straight from leads
// + pipeline_stages (this AmoCRM-synced setup never populates the deals
// table, so useRevenueSeries above would just read zeros here).
export function useSalesAnalyticsSummary(
  funnel?: string | null,
  // Only bounds perOwner (RevenueByOwnerChart) -- the other figures here
  // (YTD, 90d avg deal size, loss-rate delta, the 8-month trend) are each
  // already their own fixed window by definition, so an externally picked
  // range has no sound meaning for them.
  dateRange?: { from: Date | null; to: Date | null },
): SalesAnalyticsSummary {
  const { data: leads } = useFunnelScopedLeads(funnel ?? null);
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();

  return useMemo(() => {
    const stagesById = byId(stages);
    const profilesById = byId(profiles);
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const oneEightyDaysAgo = new Date(now);
    oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

    let forecast = 0;
    let ytdRevenue = 0;
    let lastYearRevenue = 0;
    const dealSizes90d: number[] = [];
    let recentLost = 0;
    let recentClosed = 0;
    let prevLost = 0;
    let prevClosed = 0;
    const revenueByOwner = new Map<string, number>();
    const monthlyRevenue = new Map<string, number>();

    for (const l of leads ?? []) {
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const createdAt = new Date(l.created_at);
      const revenue = l.expected_revenue;

      if (stage && !stage.is_won && !stage.is_lost) {
        forecast += revenue * (stage.probability / 100);
      }

      if (stage?.is_won) {
        if (createdAt >= yearStart) ytdRevenue += revenue;
        else if (createdAt >= lastYearStart && createdAt < yearStart) lastYearRevenue += revenue;
        if (createdAt >= ninetyDaysAgo) dealSizes90d.push(revenue);

        const inRange =
          (!dateRange?.from || createdAt >= dateRange.from) &&
          (!dateRange?.to || createdAt <= dateRange.to);
        if (inRange) {
          const owner = l.owner_id ? profilesById.get(l.owner_id) : undefined;
          const ownerName = profileName(owner);
          revenueByOwner.set(ownerName, (revenueByOwner.get(ownerName) ?? 0) + revenue);
        }

        const key = monthKey(l.created_at);
        monthlyRevenue.set(key, (monthlyRevenue.get(key) ?? 0) + revenue);
      }

      if (stage?.is_won || stage?.is_lost) {
        if (createdAt >= ninetyDaysAgo) {
          recentClosed += 1;
          if (stage.is_lost) recentLost += 1;
        } else if (createdAt >= oneEightyDaysAgo) {
          prevClosed += 1;
          if (stage.is_lost) prevLost += 1;
        }
      }
    }

    const avgDealSize = dealSizes90d.length
      ? dealSizes90d.reduce((s, v) => s + v, 0) / dealSizes90d.length
      : 0;
    const ytdDelta =
      lastYearRevenue > 0 ? ((ytdRevenue - lastYearRevenue) / lastYearRevenue) * 100 : 0;
    const lossRate = recentClosed ? (recentLost / recentClosed) * 100 : 0;
    const prevLossRate = prevClosed ? (prevLost / prevClosed) * 100 : 0;

    const monthlyTrend: { label: string; revenue: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlyTrend.push({
        label: MONTH_LABELS[d.getMonth()]!,
        revenue: monthlyRevenue.get(key) ?? 0,
      });
    }

    // Used to show only the first word of the name (assuming a western
    // "First Last" pattern) to keep chart labels short — but this org's
    // rep names follow a "Rus tili 117 | Fotima Axmedova" convention, so
    // every rep starting with "Rus tili ..." collapsed to the identical
    // label "Rus" on the chart. Keep the full name; RevenueByOwnerChart's
    // XAxis truncates long labels itself.
    const perOwner = Array.from(revenueByOwner.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    return {
      forecast,
      ytdRevenue,
      ytdDelta,
      avgDealSize,
      lossRate,
      lossRateDelta: lossRate - prevLossRate,
      monthlyTrend,
      perOwner,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateRange's getTime() values are the stable key
  }, [leads, stages, profiles, funnel, dateRange?.from?.getTime(), dateRange?.to?.getTime()]);
}

export type LostReasonBucket = { reason: string; count: number };

// AmoCRM's own "Причина отказа" (loss reason) catalog, synced onto
// leads.loss_reason -- real data that until now was only surfaced deep
// inside Lead Analytics' Yo'nalish tab, not on the Dashboard itself.
export function useLostReasonsSummary(
  funnel?: string | null,
  dateRange?: { from: Date | null; to: Date | null },
): LostReasonBucket[] {
  const { data: leads } = useFunnelScopedLeads(funnel ?? null);
  const { data: stages } = usePipelineStagesRaw();

  return useMemo(() => {
    const stagesById = byId(stages);
    const counts = new Map<string, number>();
    for (const l of leads ?? []) {
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      if (!stage?.is_lost) continue;
      const createdAt = new Date(l.created_at);
      if (dateRange?.from && createdAt < dateRange.from) continue;
      if (dateRange?.to && createdAt > dateRange.to) continue;
      const reason = l.loss_reason?.trim() || "—";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reason, count]): LostReasonBucket => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateRange's getTime() values are the stable key
  }, [leads, stages, funnel, dateRange?.from?.getTime(), dateRange?.to?.getTime()]);
}

// ISO 8601 week number (Monday-start, week 1 = the week containing the
// year's first Thursday) -- the standard definition, matching what "W31",
// "W32" etc. conventionally mean.
function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNo}`;
}

export type DealFlowWeek = {
  week: string;
  created: number;
  won: number;
  lost: number;
  revenue: number;
};

/* ------------------------------------------------------------------ */
/* Dashboard — "Sotuv dinamikasi": weekly deal flow (created vs. their   */
/* current won/lost outcome) plus revenue. Since there's no per-lead     */
/* stage-visit history in this schema (same limitation as the daily      */
/* report's biggestStageDrop), "won this week"/"lost this week" really   */
/* means "created this week, and currently sitting in a won/lost stage"  */
/* -- a cohort-outcome view, not a true week-by-week transition ledger.  */
/* ------------------------------------------------------------------ */
export function useDealFlowWeekly(funnel: string | null, weeks = 8): DealFlowWeek[] {
  const { data: leads } = useFunnelScopedLeads(funnel);
  const { data: stages } = usePipelineStagesRaw();

  return useMemo(() => {
    const stagesById = byId(stages);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    const byWeek = new Map<
      string,
      { created: number; won: number; lost: number; revenue: number; weekStart: Date }
    >();

    for (const l of leads ?? []) {
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      const createdAt = new Date(l.created_at);
      if (createdAt < cutoff) continue;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const label = isoWeekLabel(createdAt);
      const bucket = byWeek.get(label) ?? {
        created: 0,
        won: 0,
        lost: 0,
        revenue: 0,
        weekStart: createdAt,
      };
      bucket.created += 1;
      if (stage?.is_won) {
        bucket.won += 1;
        bucket.revenue += l.expected_revenue;
      } else if (stage?.is_lost) {
        bucket.lost += 1;
      }
      if (createdAt < bucket.weekStart) bucket.weekStart = createdAt;
      byWeek.set(label, bucket);
    }

    return Array.from(byWeek.entries())
      .sort((a, b) => a[1].weekStart.getTime() - b[1].weekStart.getTime())
      .map(([week, b]) => ({
        week,
        created: b.created,
        won: b.won,
        lost: b.lost,
        revenue: b.revenue,
      }));
  }, [leads, stages, funnel, weeks]);
}

export type ConversionQualityWeek = {
  week: string;
  conversionPct: number | null;
  inRangePct: number | null;
};

/* ------------------------------------------------------------------ */
/* Dashboard — "Konversiya va qo'ng'iroq sifati": does a higher share of */
/* good-scoring calls in a week line up with a higher conversion rate    */
/* for leads created that week? Correlation is Pearson's r over the      */
/* weeks where both series have a value.                                 */
/* ------------------------------------------------------------------ */
export function useConversionQualityWeekly(
  funnel: string | null,
  scoreMin: number,
  scoreMax: number,
  weeks = 12,
): { rows: ConversionQualityWeek[]; correlation: number | null } {
  const { data: leads } = useFunnelScopedLeads(funnel);
  const { data: stages } = usePipelineStagesRaw();
  const { data: calls } = useAmoCrmCallsRaw();

  return useMemo(() => {
    const stagesById = byId(stages);
    const leadsById = byId(leads);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    type Bucket = {
      created: number;
      won: number;
      totalCalls: number;
      inRangeCalls: number;
      weekStart: Date;
    };
    const byWeek = new Map<string, Bucket>();
    const bucketFor = (label: string, start: Date): Bucket => {
      let b = byWeek.get(label);
      if (!b) {
        b = { created: 0, won: 0, totalCalls: 0, inRangeCalls: 0, weekStart: start };
        byWeek.set(label, b);
      }
      return b;
    };

    for (const l of leads ?? []) {
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      const createdAt = new Date(l.created_at);
      if (createdAt < cutoff) continue;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const b = bucketFor(isoWeekLabel(createdAt), createdAt);
      b.created += 1;
      if (stage?.is_won) b.won += 1;
    }

    for (const c of calls ?? []) {
      if (c.score == null) continue;
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      const leadFunnel = lead ? lead.funnel || "Direct Sales" : null;
      if (funnel && leadFunnel !== funnel) continue;
      const occurredAt = new Date(c.occurred_at);
      if (occurredAt < cutoff) continue;
      const b = bucketFor(isoWeekLabel(occurredAt), occurredAt);
      b.totalCalls += 1;
      if (c.score >= scoreMin && c.score <= scoreMax) b.inRangeCalls += 1;
    }

    const rows = Array.from(byWeek.entries())
      .sort((a, b) => a[1].weekStart.getTime() - b[1].weekStart.getTime())
      .map(([week, b]) => ({
        week,
        conversionPct: b.created > 0 ? Math.round((b.won / b.created) * 1000) / 10 : null,
        inRangePct:
          b.totalCalls > 0 ? Math.round((b.inRangeCalls / b.totalCalls) * 1000) / 10 : null,
      }));

    const pairs = rows.filter(
      (r): r is { week: string; conversionPct: number; inRangePct: number } =>
        r.conversionPct != null && r.inRangePct != null,
    );
    let correlation: number | null = null;
    if (pairs.length >= 2) {
      const xs = pairs.map((p) => p.conversionPct);
      const ys = pairs.map((p) => p.inRangePct);
      const n = xs.length;
      const meanX = xs.reduce((s, v) => s + v, 0) / n;
      const meanY = ys.reduce((s, v) => s + v, 0) / n;
      let num = 0;
      let denX = 0;
      let denY = 0;
      for (let i = 0; i < n; i++) {
        const dx = xs[i]! - meanX;
        const dy = ys[i]! - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const den = Math.sqrt(denX * denY);
      correlation = den > 0 ? Math.round((num / den) * 100) / 100 : null;
    }

    return { rows, correlation };
  }, [leads, stages, calls, funnel, scoreMin, scoreMax, weeks]);
}

/* ------------------------------------------------------------------ */
/* Kunlik/Haftalik/Oylik hisobot (Boshqaruv paneli's report section) — */
/* a single period-scoped aggregate over leads/calls/stages, all       */
/* already cached elsewhere in the app. Mirrors the "biggest picture"  */
/* daily-report tools like metrixme produce, computed from our own     */
/* real CRM data rather than a separate reporting backend.             */
/* ------------------------------------------------------------------ */

export type DailyReportScope = {
  funnel: string | null;
  teamId: string | null; // a ROP's profile id -- scopes to their whole team
  operatorId: string | null; // a single manager's profile id
};

export type DailyReportStageDrop = { fromStage: string; toStage: string; dropPct: number };

export type DailyReportStats = {
  totalCalls: number;
  connectedCalls: number;
  missedCalls: number;
  contactRatePct: number;
  totalCallSeconds: number;
  avgCallSeconds: number;
  avgCallScore: number | null;
  newLeads: number;
  soldLeads: number;
  soldLeadsPct: number;
  openLeads: number;
  wonLeadsCreated: number;
  wonLeadsCreatedPct: number;
  connectedLeadsCount: number;
  wonFromConnectedCount: number;
  wonFromConnectedPct: number;
  // Only computable when a single funnel is selected -- stage positions
  // aren't comparable across different AmoCRM pipelines. This reads each
  // lead's *current* stage as how far it "reached" in the funnel (there's
  // no per-lead stage-visit history to replay), so it's a snapshot
  // approximation of a true cohort waterfall, not an exact one.
  biggestStageDrop: DailyReportStageDrop | null;
  periodRevenue: number;
  prevPeriodRevenue: number;
  revenueDeltaPct: number | null;
  fullPaymentCount: number;
  prevFullPaymentCount: number;
  fullPaymentDeltaPct: number | null;
  revenueTrend: { label: string; revenue: number }[];
  operatorBreakdown: {
    id: string;
    name: string;
    calls: number;
    avgScore: number | null;
    totalSeconds: number;
  }[];
  callFlowByDay: { label: string; connected: number; missed: number }[];
  // Only computable when a single funnel is selected, same reasoning as
  // biggestStageDrop -- stage names/positions aren't comparable across
  // different AmoCRM pipelines.
  stageBreakdown: { stage: string; count: number; pct: number }[];
};

const EMPTY_DAILY_REPORT_STATS: DailyReportStats = {
  totalCalls: 0,
  connectedCalls: 0,
  missedCalls: 0,
  contactRatePct: 0,
  totalCallSeconds: 0,
  avgCallSeconds: 0,
  avgCallScore: null,
  newLeads: 0,
  soldLeads: 0,
  soldLeadsPct: 0,
  openLeads: 0,
  wonLeadsCreated: 0,
  wonLeadsCreatedPct: 0,
  connectedLeadsCount: 0,
  wonFromConnectedCount: 0,
  wonFromConnectedPct: 0,
  biggestStageDrop: null,
  periodRevenue: 0,
  prevPeriodRevenue: 0,
  revenueDeltaPct: null,
  fullPaymentCount: 0,
  prevFullPaymentCount: 0,
  fullPaymentDeltaPct: null,
  revenueTrend: [],
  operatorBreakdown: [],
  callFlowByDay: [],
  stageBreakdown: [],
};

// A narrower match than SALES_STAGE_KEYWORDS -- "full payment" specifically
// (won or fully-paid), not prepayment/half-payment stages too.
export const FULL_PAYMENT_STAGE_KEYWORDS = ["toliq", "won", "успешно", "rop closed"];

export function useDailyReportStats(
  range: { from: Date; to: Date } | null,
  prevRange: { from: Date; to: Date } | null,
  scope: DailyReportScope,
): DailyReportStats {
  const { data: leads } = useLeadsRaw();
  const { data: calls } = useAmoCrmCallsRaw();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();

  return useMemo(() => {
    if (!range || !prevRange) return EMPTY_DAILY_REPORT_STATS;

    const stagesById = byId(stages);
    const leadsById = byId(leads);
    const leadFunnelOf = (l: LeadRow) => l.funnel || "Direct Sales";

    let visibleOwnerIds: Set<string> | null = null;
    if (scope.operatorId) {
      visibleOwnerIds = new Set([scope.operatorId]);
    } else if (scope.teamId) {
      const ids = new Set<string>([scope.teamId]);
      for (const p of profiles ?? []) if (p.manager_id === scope.teamId) ids.add(p.id);
      visibleOwnerIds = ids;
    }
    const inScope = (ownerId: string | null): boolean => {
      if (!ownerId) return false;
      return !visibleOwnerIds || visibleOwnerIds.has(ownerId);
    };

    function leadsCreatedIn(r: { from: Date; to: Date }): LeadRow[] {
      return (leads ?? []).filter((l) => {
        if (scope.funnel && leadFunnelOf(l) !== scope.funnel) return false;
        if (!inScope(l.owner_id)) return false;
        const created = new Date(l.created_at);
        return created >= r.from && created < r.to;
      });
    }

    const leadsInRange = leadsCreatedIn(range);

    let soldLeads = 0;
    let wonLeadsCreated = 0;
    let openLeads = 0;
    let periodRevenue = 0;
    let fullPaymentCount = 0;
    const revenueByDay = new Map<string, number>();
    for (const l of leadsInRange) {
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const stageName = stage ? normalizeStageName(stage.name) : "";
      const isSalesStage = SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
      if (isSalesStage) {
        soldLeads += 1;
        periodRevenue += l.expected_revenue;
        const dayKey = new Date(l.created_at).toDateString();
        revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + l.expected_revenue);
      }
      if (FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) fullPaymentCount += 1;
      if (stage?.is_won) wonLeadsCreated += 1;
      if (!stage?.is_won && !stage?.is_lost) openLeads += 1;
    }

    const revenueTrend: DailyReportStats["revenueTrend"] = [];
    for (let d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
      revenueTrend.push({
        label: `${d.getDate()}`,
        revenue: revenueByDay.get(d.toDateString()) ?? 0,
      });
    }

    const prevLeadsInRange = leadsCreatedIn(prevRange);
    let prevPeriodRevenue = 0;
    let prevFullPaymentCount = 0;
    for (const l of prevLeadsInRange) {
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const stageName = stage ? normalizeStageName(stage.name) : "";
      if (SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        prevPeriodRevenue += l.expected_revenue;
      }
      if (FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        prevFullPaymentCount += 1;
      }
    }

    const callsInRange = (calls ?? []).filter((c) => {
      const occurred = new Date(c.occurred_at);
      if (occurred < range.from || occurred >= range.to) return false;
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      if (scope.funnel && (lead ? leadFunnelOf(lead) : null) !== scope.funnel) return false;
      return inScope(lead?.owner_id ?? null);
    });

    const totalCalls = callsInRange.length;
    const connectedCalls = callsInRange.filter((c) => c.connected).length;
    const totalCallSeconds = callsInRange.reduce((s, c) => s + c.duration_seconds, 0);
    const scoredCalls = callsInRange.filter((c) => c.score != null);
    const avgCallScore = scoredCalls.length
      ? Math.round(scoredCalls.reduce((s, c) => s + (c.score ?? 0), 0) / scoredCalls.length)
      : null;

    const connectedLeadIds = new Set(
      callsInRange.filter((c) => c.connected && c.lead_id).map((c) => c.lead_id!),
    );
    let wonFromConnectedCount = 0;
    for (const id of connectedLeadIds) {
      const lead = leadsById.get(id);
      const stage = lead?.stage_id ? stagesById.get(lead.stage_id) : undefined;
      if (stage?.is_won) wonFromConnectedCount += 1;
    }

    let biggestStageDrop: DailyReportStageDrop | null = null;
    if (scope.funnel) {
      const orderedStages = (stages ?? [])
        .filter((s) => s.pipeline_name === scope.funnel && !s.is_lost)
        .sort((a, b) => a.position - b.position);
      if (orderedStages.length >= 2) {
        const reach = orderedStages.map(
          (s) =>
            leadsInRange.filter((l) => {
              const st = l.stage_id ? stagesById.get(l.stage_id) : undefined;
              return st && !st.is_lost && st.position >= s.position;
            }).length,
        );
        let worstIdx = -1;
        let worstDrop = -Infinity;
        for (let i = 0; i < reach.length - 1; i++) {
          if (reach[i] === 0) continue;
          const drop = 100 - (reach[i + 1]! / reach[i]!) * 100;
          if (drop > worstDrop) {
            worstDrop = drop;
            worstIdx = i;
          }
        }
        if (worstIdx >= 0) {
          biggestStageDrop = {
            fromStage: orderedStages[worstIdx]!.name,
            toStage: orderedStages[worstIdx + 1]!.name,
            dropPct: Math.round(worstDrop),
          };
        }
      }
    }

    const profilesById = byId(profiles);
    type OperatorAgg = { calls: number; scoreSum: number; scoreCount: number; seconds: number };
    const operatorAgg = new Map<string, OperatorAgg>();
    for (const c of callsInRange) {
      const lead = c.lead_id ? leadsById.get(c.lead_id) : undefined;
      if (!lead?.owner_id) continue;
      const cur = operatorAgg.get(lead.owner_id) ?? {
        calls: 0,
        scoreSum: 0,
        scoreCount: 0,
        seconds: 0,
      };
      cur.calls += 1;
      cur.seconds += c.duration_seconds;
      if (c.score != null) {
        cur.scoreSum += c.score;
        cur.scoreCount += 1;
      }
      operatorAgg.set(lead.owner_id, cur);
    }
    const operatorBreakdown = Array.from(operatorAgg.entries())
      .map(([id, a]) => ({
        id,
        name: profileName(profilesById.get(id)),
        calls: a.calls,
        avgScore: a.scoreCount ? Math.round(a.scoreSum / a.scoreCount) : null,
        totalSeconds: a.seconds,
      }))
      .sort((a, b) => b.calls - a.calls);

    const callFlowByDay: DailyReportStats["callFlowByDay"] = [];
    const connectedByDay = new Map<string, number>();
    const missedByDay = new Map<string, number>();
    for (const c of callsInRange) {
      const dayKey = new Date(c.occurred_at).toDateString();
      if (c.connected) connectedByDay.set(dayKey, (connectedByDay.get(dayKey) ?? 0) + 1);
      else missedByDay.set(dayKey, (missedByDay.get(dayKey) ?? 0) + 1);
    }
    for (let d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
      const dayKey = d.toDateString();
      callFlowByDay.push({
        label: `${d.getDate()}`,
        connected: connectedByDay.get(dayKey) ?? 0,
        missed: missedByDay.get(dayKey) ?? 0,
      });
    }

    let stageBreakdown: DailyReportStats["stageBreakdown"] = [];
    if (scope.funnel) {
      const funnelStages = (stages ?? [])
        .filter((s) => s.pipeline_name === scope.funnel)
        .sort((a, b) => a.position - b.position);
      const base = leadsInRange.length || 1;
      stageBreakdown = funnelStages
        .map((s) => {
          const count = leadsInRange.filter((l) => l.stage_id === s.id).length;
          return { stage: s.name, count, pct: Math.round((count / base) * 1000) / 10 };
        })
        .filter((s) => s.count > 0);
    }

    return {
      totalCalls,
      connectedCalls,
      missedCalls: totalCalls - connectedCalls,
      contactRatePct: totalCalls ? Math.round((connectedCalls / totalCalls) * 1000) / 10 : 0,
      totalCallSeconds,
      avgCallSeconds: totalCalls ? Math.round(totalCallSeconds / totalCalls) : 0,
      avgCallScore,
      newLeads: leadsInRange.length,
      soldLeads,
      soldLeadsPct: leadsInRange.length
        ? Math.round((soldLeads / leadsInRange.length) * 1000) / 10
        : 0,
      openLeads,
      wonLeadsCreated,
      wonLeadsCreatedPct: leadsInRange.length
        ? Math.round((wonLeadsCreated / leadsInRange.length) * 1000) / 10
        : 0,
      connectedLeadsCount: connectedLeadIds.size,
      wonFromConnectedCount,
      wonFromConnectedPct: connectedLeadIds.size
        ? Math.round((wonFromConnectedCount / connectedLeadIds.size) * 1000) / 10
        : 0,
      biggestStageDrop,
      periodRevenue,
      prevPeriodRevenue,
      revenueDeltaPct:
        prevPeriodRevenue > 0
          ? Math.round(((periodRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 1000) / 10
          : null,
      fullPaymentCount,
      prevFullPaymentCount,
      fullPaymentDeltaPct:
        prevFullPaymentCount > 0
          ? Math.round(((fullPaymentCount - prevFullPaymentCount) / prevFullPaymentCount) * 1000) /
            10
          : null,
      revenueTrend,
      operatorBreakdown,
      callFlowByDay,
      stageBreakdown,
    };
  }, [
    leads,
    calls,
    stages,
    profiles,
    range,
    prevRange,
    scope.funnel,
    scope.teamId,
    scope.operatorId,
  ]);
}

// Both dashboard funnel widgets used to aggregate the deals table (which
// this AmoCRM-synced setup never actually populates -- real revenue lives
// on leads) and/or every pipeline_stages row across the whole org (~60
// AmoCRM pipelines here, all sharing generic stage names like
// "Неразобранное") with no funnel filter, producing a chart with dozens of
// duplicate-labeled all-zero bars. Both now require an explicit funnel
// selection and read real, funnel-scoped lead data -- the funnel-scoped
// fetch is shared (same react-query key) between the two widgets, so
// selecting a funnel costs one request, not two.
export function usePipelineStageStats(funnel: string | null) {
  const board = usePipelineBoardLeads(funnel);
  return useMemo(() => {
    if (!funnel) return [];
    const funnelStages = board.stages
      .filter((s) => s.pipeline_name === funnel)
      .sort((a, b) => a.position - b.position);
    return funnelStages.map((s) => {
      const inStage = board.rows.filter((l) => l.stageId === s.id);
      return {
        stage: s.name,
        value: inStage.reduce((sum, l) => sum + l.expectedRevenue, 0),
        deals: inStage.length,
      };
    });
  }, [funnel, board.stages, board.rows]);
}

export function useFunnelFlow(funnel: string | null) {
  const board = usePipelineBoardLeads(funnel);
  return useMemo(() => {
    if (!funnel) return [];
    const funnelStages = board.stages
      .filter((s) => s.pipeline_name === funnel)
      .sort((a, b) => a.position - b.position);
    const base = board.rows.length || 1;
    return funnelStages.map((s) => {
      const count = board.rows.filter((l) => l.stageId === s.id).length;
      return { stage: s.name, count, conversion: Math.round((count / base) * 1000) / 10 };
    });
  }, [funnel, board.stages, board.rows]);
}

export type ActivityItem = {
  id: string;
  who: string;
  what: string;
  when: string;
  leadName: string | null;
};

export function useRecentActivity(limit = 6, funnel?: string | null) {
  const { user } = useAuth();
  const { data: leads } = useLeadsRaw();
  const { data: profiles } = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  // A funnel filter (or an owner-scoped role) has to narrow the lead set
  // *before* the row limit is applied, not after — otherwise "8 most recent
  // org-wide" gets client-filtered down to whatever's left, which can be
  // empty even when plenty of matching activity exists further back. This
  // also closes a real gap: this query previously had no owner scoping at
  // all, so a rep could see a teammate's activity here.
  const needsScoping = !!funnel || !!visibleOwnerIds;
  const scopedLeadIds = useMemo(() => {
    if (!needsScoping) return null;
    return (leads ?? [])
      .filter((l) => {
        if (funnel && (l.funnel || "Direct Sales") !== funnel) return false;
        if (visibleOwnerIds && (!l.owner_id || !visibleOwnerIds.has(l.owner_id))) return false;
        return true;
      })
      .map((l) => l.id);
  }, [leads, funnel, visibleOwnerIds, needsScoping]);
  const scopeKey = scopedLeadIds ? scopedLeadIds.slice().sort().join(",") : null;

  const activityQuery = useQuery({
    queryKey: ["recent-activity", limit, funnel ?? null, scopeKey],
    enabled: !!user && (!needsScoping || leads !== undefined),
    queryFn: async (): Promise<LeadActivityRow[]> => {
      if (scopedLeadIds && scopedLeadIds.length === 0) return [];
      let query = supabase.from("lead_activities").select("*");
      if (scopedLeadIds) query = query.in("lead_id", scopedLeadIds);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<ActivityItem[]>(() => {
    const leadsById = byId(leads);
    const profilesById = byId(profiles);
    return (activityQuery.data ?? []).map((a) => {
      const lead = leadsById.get(a.lead_id);
      const author = a.created_by ? profilesById.get(a.created_by) : undefined;
      return {
        id: a.id,
        who: author ? profileName(author) : "Someone",
        what: `${a.type}: ${a.content}`,
        when: timeAgo(a.created_at),
        leadName: lead?.company_name || lead?.name || null,
      };
    });
  }, [activityQuery.data, leads, profiles]);

  return { rows, isLoading: activityQuery.isLoading };
}

// Used to read the (essentially unused, since this is an AmoCRM-synced
// setup where real revenue lives on leads) deals table -- always 0. Reuses
// the same leaderboard_stats RPC the Reyting page itself uses, so this
// widget's numbers actually match the full leaderboard.
export function useTopPerformers(
  limit = 5,
  funnel: string | null = null,
  dateRange?: { from: Date | null; to: Date | null },
) {
  const { user } = useAuth();
  const { data: profiles } = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const from = dateRange?.from ? dateRange.from.toISOString() : null;
  const to = dateRange?.to ? dateRange.to.toISOString() : null;
  const statsQuery = useQuery({
    queryKey: ["leaderboard_stats", from, to, funnel, null, ""],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard_stats", {
        p_from: from,
        p_to: to,
        p_funnel: funnel,
        p_stage_id: null,
        p_tags: null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => {
    const statsByOwner = new Map((statsQuery.data ?? []).map((r) => [r.owner_id, r]));
    // Unscoped, this named every colleague + their revenue to a rep on the
    // Dashboard's "AI Insights" widget -- the same full-team reveal Reyting
    // is deliberately for, but this one isn't Reyting.
    const people = visibleOwnerIds
      ? (profiles ?? []).filter((p) => visibleOwnerIds.has(p.id))
      : (profiles ?? []);
    return people
      .map((p) => {
        const stats = statsByOwner.get(p.id);
        return {
          id: p.id,
          name: p.full_name || p.email,
          department: p.department,
          deals: stats?.won_leads ?? 0,
          revenue: stats?.revenue ?? 0,
          // null (not a fake "1") when no real target is set — dividing
          // revenue by a placeholder target of 1 produced nonsensical
          // percentages in the millions (e.g. "7,399,960%") for anyone
          // without a monthly_target configured.
          target: p.monthly_target || null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }, [statsQuery.data, profiles, visibleOwnerIds, limit]);
}

/* ------------------------------------------------------------------ */
/* AmoCRM integration — status readout + manual sync trigger.          */
/* ------------------------------------------------------------------ */

export type IntegrationSettingRow = Database["public"]["Tables"]["integration_settings"]["Row"];

export function useIntegrationSetting(key: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["integration_settings", key, user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<IntegrationSettingRow | null> => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Builds a deep link to a lead's record in the connected AmoCRM account, or null if not connected/synced. */
export function useAmoCrmLink() {
  const { data: setting } = useIntegrationSetting("amocrm");
  const subdomain = (setting?.config as { subdomain?: string } | null)?.subdomain;
  return (amocrmId: number | null): string | null => {
    if (!subdomain || !amocrmId) return null;
    return `https://${subdomain}/leads/detail/${amocrmId}`;
  };
}

export type AmoConnectionStatus = {
  subdomain: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  // Set while the initial full historical backfill is still in progress
  // (paused by its per-run time budget, resuming on the next 5-minute
  // cron tick) -- null once that backfill has fully completed.
  initial_sync_page: number | null;
  active_funnel_ignore_missing: boolean;
  sync_in_progress: boolean;
  sync_started_at: string | null;
};

/** The connected org's own AmoCRM sync status/error — super_admin only (RLS). Polls every 3s so the Integrations page reflects a sync as it happens, without a manual refresh. */
export function useAmoConnectionStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_connection_status", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    // Was 3s -- a continuous query every 3 seconds for as long as this page
    // stays open is unnecessarily aggressive for a status field that only
    // changes once every few minutes (a sync run, a connect/disconnect).
    refetchInterval: 15_000,
    queryFn: async (): Promise<AmoConnectionStatus | null> => {
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select(
          "subdomain, connected_at, last_synced_at, last_sync_error, initial_sync_page, active_funnel_ignore_missing, sync_in_progress, sync_started_at",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type AmoSyncLogRow = Tables["amocrm_sync_log"]["Row"];

/** The connected org's own recent sync runs (manual + cron), newest first — for the Integrations page's sync-history panel. */
export function useAmoSyncLog(limit = 10) {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["amocrm_sync_log", user?.organizationId, limit],
    enabled: !!user?.organizationId && isAdmin,
    refetchInterval: 15_000,
    queryFn: async (): Promise<AmoSyncLogRow[]> => {
      const { data, error } = await supabase
        .from("amocrm_sync_log")
        .select("*")
        .order("finished_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Total AmoCRM-sourced call recordings imported for the current org so far. */
export function useAmoCallsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_calls_count", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("amocrm_calls")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Calls with a real AI analysis attached -- the ones actually usable as calibration/training material ("Yaroqli qo'ng'iroqlar"), as opposed to every imported call regardless of whether it ever got analyzed. */
export function useAnalyzedCallsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_calls_analyzed_count", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("amocrm_calls")
        .select("id", { count: "exact", head: true })
        .not("analyzed_at", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useTriggerAmoCrmSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ synced: number; error?: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/sync", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      let json: { synced: number; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        // Platform-level failure (timeout, crash) returned a non-JSON body
        // — surface the raw text rather than letting JSON.parse's own
        // error ("Unexpected token ... is not valid JSON") stand in for it.
        throw new Error(text || `Sync failed (${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_calls"] });
      void qc.invalidateQueries({ queryKey: ["integration_settings", "amocrm"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_connection_status"] });
    },
  });
}

/** Refreshes AmoCRM manager -> employee mapping on its own, without a full lead sync. */
export function useRefreshAmoManagers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ mapped: number }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/sync-users", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to refresh managers");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

// Per-organization progress on the "connect AmoCRM" onboarding checklist
// (integrations.amocrm-checklist.tsx) -- stored as a {itemKey: true} map so
// toggling one item never needs to read or overwrite the rest.
export function useAmoOnboardingChecklist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_onboarding_checklist", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from("amocrm_onboarding_checklist")
        .select("checked")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.checked as Record<string, boolean> | null) ?? {};
    },
  });
}

export function useToggleAmoOnboardingChecklistItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      itemKey,
      checked,
    }: {
      itemKey: string;
      checked: boolean;
    }): Promise<Record<string, boolean>> => {
      const orgId = user!.organizationId!;
      const current =
        qc.getQueryData<Record<string, boolean>>(["amocrm_onboarding_checklist", orgId]) ?? {};
      const next = { ...current, [itemKey]: checked };
      const { error } = await supabase
        .from("amocrm_onboarding_checklist")
        .upsert(
          { organization_id: orgId, checked: next, updated_by: user!.id },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(["amocrm_onboarding_checklist", user?.organizationId], next);
    },
  });
}

export function useDisconnectAmoCrm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/admin/amocrm-disconnect", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integration_settings", "amocrm"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_connection_status"] });
      void qc.invalidateQueries({ queryKey: ["amocrm_catalog"] });
    },
  });
}

/** "Ulanishni tekshirish" -- pings AmoCRM's own API with the stored token, without running a sync. */
export function useTestAmoConnection() {
  return useMutation({
    mutationFn: async (): Promise<{ ok: true; subdomain: string; accountName: string | null }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/test-connection", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection test failed.");
      return json;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Telephony (OnlinePBX) -- module 5, for orgs running SalesIQ as their */
/* primary CRM instead of (or alongside) AmoCRM.                       */
/* ------------------------------------------------------------------ */

export type TelephonyCredentialsStatus = {
  connected: boolean;
  pbxDomain: string | null;
  callerId: string | null;
  smsSenderName: string | null;
  connectedAt: string | null;
};

export function useTelephonyStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["telephony_status", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<TelephonyCredentialsStatus> => {
      const res = await apiFetch("/integrations/telephony/credentials");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load status.");
      return json;
    },
  });
}

export function useSaveTelephonyCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      apiKey: string;
      apiSecret: string;
      pbxDomain: string;
      callerId: string;
      smsSenderName: string;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/telephony/credentials", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telephony_status"] }),
  });
}

export function useDisconnectTelephony() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/telephony/credentials", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telephony_status"] }),
  });
}

export function useTestTelephonyConnection() {
  return useMutation({
    mutationFn: async (): Promise<{ ok: true; pbxDomain: string }> => {
      const res = await apiFetch("/integrations/telephony/test-connection", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection test failed.");
      return json;
    },
  });
}

export function useStartCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toNumber: string;
      leadId?: string;
      contactId?: string;
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/integrations/telephony/call", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Qo'ng'iroq qilib bo'lmadi.");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pbx_calls"] }),
  });
}

export function useSendTelephonySms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toNumber: string;
      message: string;
      leadId?: string;
      contactId?: string;
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/integrations/telephony/sms", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "SMS yuborib bo'lmadi.");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sms_log"] }),
  });
}

export type PbxCallRow = Tables["pbx_calls"]["Row"];

/** A single lead/contact's own click-to-call history -- for the call timeline on its detail page. */
export function usePbxCalls(input: { leadId?: string; contactId?: string } | undefined) {
  return useQuery({
    queryKey: ["pbx_calls", input?.leadId, input?.contactId],
    enabled: !!(input?.leadId || input?.contactId),
    queryFn: async (): Promise<PbxCallRow[]> => {
      let query = supabase.from("pbx_calls").select("*").order("created_at", { ascending: false });
      query = input?.leadId
        ? query.eq("lead_id", input.leadId)
        : query.eq("contact_id", input!.contactId!);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ActiveFunnelCheckResult = {
  checkedAt: string;
  checkedStages: number;
  movedOrChanged: number;
  backfilled: number;
  missingInCrm: number;
  ignoreMissing: boolean;
};

/** The connected org's own last "Aktiv voronka solishtiruvi" run, if any. */
export function useActiveFunnelCheck() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["amocrm_active_funnel_check", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<ActiveFunnelCheckResult | null> => {
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select("active_funnel_last_check")
        .maybeSingle();
      if (error) throw error;
      return (data?.active_funnel_last_check as ActiveFunnelCheckResult | null) ?? null;
    },
  });
}

/** Runs a fresh "Aktiv voronka solishtiruvi" pass and stores the result. */
export function useRunActiveFunnelCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ActiveFunnelCheckResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/check-active-funnel", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Active funnel check failed.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["amocrm_active_funnel_check"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** Whether call-recording playback trims to the first answer -- see "Operatsiyalar" tab. */
export function useRecordingTrimSetting() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["amocrm_recording_trim", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select("recording_trim_before_answer")
        .maybeSingle();
      if (error) throw error;
      return data?.recording_trim_before_answer ?? false;
    },
  });
}

export function useSetRecordingTrim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/recording-trim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_recording_trim"] }),
  });
}

/** Toggles checkActiveFunnel's "CRMda yo'q kartalarni sanamaslik" setting (amocrm_connection.active_funnel_ignore_missing). */
export function useSetActiveFunnelIgnoreMissing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ignoreMissing: boolean): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/integrations/amocrm/active-funnel-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ignoreMissing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_connection_status"] }),
  });
}

export type ExternalApiTokenStatus = {
  hasToken: boolean;
  createdAt: string | null;
  revokedAt: string | null;
  tokenLast4: string | null;
};

export function useExternalApiTokenStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["external_api_token_status", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<ExternalApiTokenStatus> => {
      const res = await apiFetch("/integrations/external-api-token");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load token status.");
      return json;
    },
  });
}

export function useGenerateExternalApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ token: string }> => {
      const res = await apiFetch("/integrations/external-api-token", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not generate token.");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["external_api_token_status"] }),
  });
}

export function useRevokeExternalApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/external-api-token", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not revoke token.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["external_api_token_status"] }),
  });
}

export type OutgoingWebhook = {
  name: string;
  url: string;
  headers: Record<string, string>;
  createdAt: string;
};

export function useOutgoingWebhook() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return useQuery({
    queryKey: ["outgoing_webhook", user?.organizationId],
    enabled: !!user?.organizationId && isAdmin,
    queryFn: async (): Promise<OutgoingWebhook | null> => {
      const res = await apiFetch("/integrations/outgoing-webhook");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load webhook.");
      return json.webhook ?? null;
    },
  });
}

export function useSaveOutgoingWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      url: string;
      headers: Record<string, string>;
    }): Promise<void> => {
      const res = await apiFetch("/integrations/outgoing-webhook", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save webhook.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["outgoing_webhook"] }),
  });
}

export function useDeleteOutgoingWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch("/integrations/outgoing-webhook", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not delete webhook.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["outgoing_webhook"] }),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      full_name: string;
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/admin/create-employee", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create employee");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch("/admin/delete-employee", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete employee");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useSetEmployeePassword() {
  return useMutation({
    mutationFn: async (input: { id: string; password: string }): Promise<void> => {
      const res = await apiFetch("/admin/set-employee-password", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to set password");
    },
  });
}

export type CompanyDirectoryEntry = {
  id: string;
  name: string;
  active: boolean;
  plan: string;
  createdAt: string;
  employeeCount: number;
  superAdminId: string | null;
  login: string | null;
  password: string | null;
};

export type CompanyDirectory = {
  owner: { id: string; name: string; email: string };
  companies: CompanyDirectoryEntry[];
};

/** Platform owner's company switcher: own profile + every organization's employee count and Super Admin login/password (password is null until one has been set through a route that mirrors it). */
export function useCompanyDirectory() {
  return useQuery({
    queryKey: ["company_directory"],
    queryFn: async (): Promise<CompanyDirectory> => {
      const res = await apiFetch("/platform/company-directory");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kompaniyalar ro'yxatini yuklab bo'lmadi");
      return json;
    },
  });
}

export type OrganizationRow = Tables["organizations"]["Row"];

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: async (): Promise<OrganizationRow[]> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Self-signup subscription flow -- one platform-wide row of support     */
/* contact info (Telegram/phone/email, set once by the platform owner,   */
/* shown on every org's own "Obuna" page) and a request queue an org's   */
/* own admin uses to tell the platform owner "we paid, please            */
/* reactivate us" until a real payment processor is wired up.            */
/* ------------------------------------------------------------------ */

export type PlatformSettingsRow = Tables["platform_settings"]["Row"];

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform_settings"],
    queryFn: async (): Promise<PlatformSettingsRow | null> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      support_telegram?: string | null;
      support_phone?: string | null;
      support_email?: string | null;
    }) => {
      const { error } = await supabase.from("platform_settings").update(patch).eq("id", true);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform_settings"] }),
  });
}

export function useCreateSubscriptionRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note?: string) => {
      const { error } = await supabase.from("subscription_requests").insert({
        organization_id: user!.organizationId!,
        requested_by: user!.id,
        note: note?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subscription_requests"] }),
  });
}

export type SubscriptionRequestRow = Tables["subscription_requests"]["Row"] & {
  organizations: { name: string } | null;
};

/** Platform-owner-only feed of pending renewal requests, newest first. */
export function useSubscriptionRequestsRaw() {
  return useQuery({
    queryKey: ["subscription_requests"],
    queryFn: async (): Promise<SubscriptionRequestRow[]> => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubscriptionRequestRow[];
    },
  });
}

export function useResolveSubscriptionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_requests")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subscription_requests"] }),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      admin_email: string;
      admin_password: string;
      admin_full_name: string;
      rop_email: string;
      rop_password: string;
      rop_full_name: string;
      phone?: string | undefined;
      plan?: string | undefined;
      trial_days?: number | undefined;
    }): Promise<{ organizationId: string }> => {
      const res = await apiFetch("/platform/create-organization", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create organization");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<OrganizationRow, "name" | "phone" | "plan" | "active" | "trial_ends_at">>;
    }) => {
      const { error } = await supabase.from("organizations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useDeactivateExpiredTrials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiFetch("/platform/deactivate-expired-trials", { method: "POST" });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

/** Platform owner: delete any company member's account, from any organization. */
export function useDeleteUserAsOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch("/platform/delete-user", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete user");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] }),
  });
}

/** Platform owner: edit any company member's name, role, and/or reset their password. */
export function useUpdateUserAsOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      full_name?: string;
      role?: "super_admin" | "rop" | "sotuv_menejeri";
      password?: string;
    }): Promise<void> => {
      const res = await apiFetch("/platform/update-user", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update user");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] }),
  });
}

/** Platform owner: add a ROP/Sotuv menejeri/Super Admin account to an existing company. */
export function useAddOrgEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organization_id: string;
      email: string;
      password: string;
      full_name: string;
      role: "super_admin" | "rop" | "sotuv_menejeri";
    }): Promise<{ id: string }> => {
      const res = await apiFetch("/platform/add-employee", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add employee");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] }),
  });
}

/** Platform owner: permanently delete a company and every row/account tied to it. */
export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch("/platform/delete-organization", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete company");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.invalidateQueries({ queryKey: ["owner_all_profiles"] });
    },
  });
}

// Cross-org visibility for the platform owner only — RLS on each of these
// tables grants read access to is_platform_owner() (see migration
// 20260812130000_owner_panel.sql); every other role's queries stay scoped
// to their own organization_id as before.

export type OwnerProfileRow = ProfileRow & { organizations: { name: string } | null };

export function useAllProfiles() {
  return useQuery({
    queryKey: ["owner_all_profiles"],
    queryFn: async (): Promise<OwnerProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, organizations(name)")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OwnerProfileRow[];
    },
  });
}

export type OwnerAmoConnectionRow = {
  organization_id: string;
  subdomain: string;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  organizations: { name: string } | null;
};

export function useAllAmoConnections() {
  return useQuery({
    queryKey: ["owner_all_amo_connections"],
    queryFn: async (): Promise<OwnerAmoConnectionRow[]> => {
      // Deliberately not selecting access_token/refresh_token — the owner
      // overview only needs connection status, never the live OAuth secrets.
      const { data, error } = await supabase
        .from("amocrm_connection")
        .select(
          "organization_id, subdomain, connected_at, last_synced_at, last_sync_error, organizations(name)",
        );
      if (error) throw error;
      return (data ?? []) as OwnerAmoConnectionRow[];
    },
  });
}

/** Platform-owner counterpart to useDisconnectAmoCrm — names the target company explicitly, since the owner has no organizationId of their own to imply one. */
export function usePlatformDisconnectAmoCrm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/platform/amocrm-disconnect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ organizationId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not disconnect.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["owner_all_amo_connections"] });
    },
  });
}

/** Lets the platform owner set a target company's AmoCRM client_id/client_secret before that company has its own super_admin do it. */
export function usePlatformSetAmoCrmCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      clientId: string;
      clientSecret: string;
    }): Promise<void> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/platform/amocrm-credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save credentials.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["owner_all_amo_connections"] });
    },
  });
}

export type OwnerAiAgentRow = Tables["ai_agents"]["Row"] & {
  organizations: { name: string } | null;
};

export function useAllAiAgents() {
  return useQuery({
    queryKey: ["owner_all_ai_agents"],
    queryFn: async (): Promise<OwnerAiAgentRow[]> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*, organizations(name)")
        .order("organization_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OwnerAiAgentRow[];
    },
  });
}

export type OwnerAuditLogRow = Tables["audit_logs"]["Row"] & {
  organizations: { name: string } | null;
};

export function useAllAuditLogs() {
  return useQuery({
    queryKey: ["owner_all_audit_logs"],
    queryFn: async (): Promise<OwnerAuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as OwnerAuditLogRow[];
    },
  });
}

export function useAiAssistantChat() {
  return useMutation({
    mutationFn: async (input: {
      messages: { role: "user" | "assistant"; content: string }[];
      asOf?: Date | null;
    }): Promise<string> => {
      // fetch() has no default timeout -- if the server hangs (or the
      // connection stalls) this call would otherwise wait forever with no
      // error, leaving the chat's "thinking" state on screen indefinitely.
      // The server budgets ~25s per Gemini round x up to 4 rounds; 115s
      // gives that room plus DB/tool-call time before this gives up.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 115_000);
      let res: Response;
      try {
        res = await apiFetch("/ai-assistant/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: input.messages,
            asOf: input.asOf ? input.asOf.toISOString() : null,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("TIMEOUT");
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI assistant failed");
      return json.reply as string;
    },
  });
}

/* ------------------------------------------------------------------ */
/* AI Assistant chat history -- conversations used to live only in the  */
/* browser tab's React state (gone on refresh), so there was no "Tarix" */
/* (history) to show, search, or resume. Persisted the same way the     */
/* rest of the app's owner-scoped tables work.                          */
/* ------------------------------------------------------------------ */

export type AiChatConversationRow = Database["public"]["Tables"]["ai_chat_conversations"]["Row"];
export type AiChatMessageRow = Database["public"]["Tables"]["ai_chat_messages"]["Row"];

export function useAiConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai_chat_conversations", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AiChatConversationRow[]> => {
      const { data, error } = await supabase
        .from("ai_chat_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAiConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["ai_chat_messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<AiChatMessageRow[]> => {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateAiConversation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string): Promise<AiChatConversationRow> => {
      if (!user?.id) throw new Error("Not signed in.");
      const { data, error } = await supabase
        .from("ai_chat_conversations")
        .insert({ profile_id: user.id, title: title.slice(0, 80) || "New chat" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai_chat_conversations"] });
    },
  });
}

export function useSaveAiMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      role: "user" | "assistant";
      content: string;
    }) => {
      const { error: insertError } = await supabase.from("ai_chat_messages").insert({
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
      });
      if (insertError) throw insertError;
      // Bumps updated_at so this conversation sorts back to the top of the
      // history panel the moment it gets a new message.
      const { error: touchError } = await supabase
        .from("ai_chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.conversationId);
      if (touchError) throw touchError;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["ai_chat_conversations"] });
      void qc.invalidateQueries({ queryKey: ["ai_chat_messages", vars.conversationId] });
    },
  });
}

export function useAnalyzeCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      callId: string,
    ): Promise<{
      transcript: string;
      summary: string;
      nextStep: string | null;
      taskWarning: string | null;
      score: number | null;
      mood: string | null;
      talkRatio: number | null;
      analysis: CallAnalysis | null;
    }> => {
      const res = await apiFetch("/audio-analytics/analyze", {
        method: "POST",
        body: JSON.stringify({ callId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Call analysis failed");
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_calls"] }),
  });
}

export type ManualCallUpload = {
  file: File;
  leadId: string | null;
  phone: string;
  direction: "in" | "out";
  connected: boolean;
};

export function useUploadManualCall() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualCallUpload) => {
      if (!user) throw new Error("Not signed in");
      const ext = input.file.name.split(".").pop() || "mp3";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("call-recordings")
        .upload(path, input.file, { contentType: input.file.type || "audio/mpeg" });
      if (uploadError) throw new Error(uploadError.message);

      const { data: pub } = supabase.storage.from("call-recordings").getPublicUrl(path);

      const row: Tables["amocrm_calls"]["Insert"] = {
        source: "manual",
        organization_id: user.organizationId!,
        created_by: user.id,
        amocrm_note_id: null,
        lead_id: input.leadId,
        direction: input.direction,
        phone: input.phone || null,
        connected: input.connected,
        recording_url: pub.publicUrl,
        occurred_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("amocrm_calls").insert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amocrm_calls"] }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}

/* ------------------------------------------------------------------ */
/* Notification preferences — per-user opt-in for in-app notifications.*/
/* Readable by anyone (so the person creating a task can check whether */
/* the assignee wants to be notified); writable only by the owner.     */
/* ------------------------------------------------------------------ */

export type NotificationPreferencesRow = Tables["notification_preferences"]["Row"];

export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notification_preferences", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<NotificationPreferencesRow> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? { profile_id: user!.id, task_assigned: true, updated_at: new Date().toISOString() }
      );
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: { task_assigned: boolean }) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ profile_id: user!.id, ...patch }, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["notification_preferences", user?.id] }),
  });
}

// Called after a task is created with a real assignee — checks the
// assignee's preference (defaulting to on) before writing the notification,
// so the toggle in Settings actually controls something.
export async function notifyTaskAssigned(assigneeId: string, taskTitle: string): Promise<void> {
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("task_assigned")
    .eq("profile_id", assigneeId)
    .maybeSingle();
  if (prefs && prefs.task_assigned === false) return;
  await supabase.from("notifications").insert({
    user_id: assigneeId,
    type: "task_assigned",
    title: taskTitle,
    body: "Sizga yangi vazifa biriktirildi.",
    link: "/tasks",
  });

  // The in-app bell above is done at this point (client insert, RLS-backed,
  // same as always) -- this is purely the extra push send, which needs the
  // VAPID private key and can only run server-side. Best-effort: if the
  // assignee has no push subscription (or push isn't configured at all),
  // the server route just reports 0 sent, nothing to handle here.
  try {
    await apiFetch("/notifications/send-push", {
      method: "POST",
      body: JSON.stringify({
        assigneeId,
        title: taskTitle,
        body: "Sizga yangi vazifa biriktirildi.",
        link: "/tasks",
      }),
    });
  } catch {
    // Push is a nice-to-have on top of the in-app bell -- never let a
    // network hiccup here surface as a failure to the task-creation flow.
  }
}

/* ------------------------------------------------------------------ */
/* Business profile — a single shared row used as AI assistant context */
/* ------------------------------------------------------------------ */

export type BusinessProfileRow = Tables["business_profile"]["Row"];

export type ProductServiceItem = { name: string; description: string };
export type ObjectionItem = { objection: string; response: string };
export type GlossaryItem = { term: string; definition: string };

export function useBusinessProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business_profile", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<BusinessProfileRow | null> => {
      const { data, error } = await supabase
        .from("business_profile")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateBusinessProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          BusinessProfileRow,
          | "company_name"
          | "description"
          | "competitors"
          | "terminology"
          | "tone"
          | "value_proposition"
          | "target_customer"
          | "qualified_lead_definition"
          | "products_services"
          | "objections"
          | "glossary"
          | "competitors_list"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("business_profile")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["business_profile", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Umumiy" (General) settings -- the read-only account info card      */
/* reads straight from organizations (existing RLS already allows a    */
/* member to select their own org row); everything editable lives in   */
/* org_general_settings.                                               */
/* ------------------------------------------------------------------ */

export type MyOrganizationRow = Pick<
  Tables["organizations"]["Row"],
  "id" | "name" | "active" | "created_at"
>;

export function useMyOrganization() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organizations", "mine", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<MyOrganizationRow | null> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, active, created_at")
        .eq("id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type OrgGeneralSettingsRow = Tables["org_general_settings"]["Row"];

export function useOrgGeneralSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_general_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgGeneralSettingsRow | null> => {
      const { data, error } = await supabase
        .from("org_general_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrgGeneralSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          OrgGeneralSettingsRow,
          | "industry"
          | "business_language"
          | "timezone"
          | "crm_task_forwarding_enabled"
          | "ai_task_creation_enabled"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("org_general_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_general_settings", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Ish jadvali" (Work schedule) -- working hours + alert toggle.       */
/* ------------------------------------------------------------------ */

export type OrgWorkScheduleRow = Tables["org_work_schedule"]["Row"];

export function useOrgWorkSchedule() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_work_schedule", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgWorkScheduleRow | null> => {
      const { data, error } = await supabase
        .from("org_work_schedule")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrgWorkSchedule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          OrgWorkScheduleRow,
          "alerts_enabled" | "start_time" | "end_time" | "work_days" | "manager_specific_schedule"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("org_work_schedule")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_work_schedule", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* "Muammo haqida xabar berish" (Report a problem) -- a plain feedback  */
/* inbox; any org member can send, only admins/managers can read.      */
/* ------------------------------------------------------------------ */

export function useSendFeedbackReport() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (message: string) => {
      const { error } = await supabase.from("feedback_reports").insert({
        organization_id: user!.organizationId!,
        user_id: user!.id,
        message,
      });
      if (error) throw error;
    },
  });
}

/* ------------------------------------------------------------------ */
/* "Bildirishnomalar" (org-wide notification routing matrix) -- which   */
/* alert types fire and where (Veb/Telegram bot/guruh/kanal), plus the  */
/* low-call-quality sub-settings and bound Telegram groups/channels.    */
/* ------------------------------------------------------------------ */

export type OrgNotificationSettingsRow = Tables["org_notification_settings"]["Row"];

export function useOrgNotificationSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_notification_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<OrgNotificationSettingsRow | null> => {
      const { data, error } = await supabase
        .from("org_notification_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrgNotificationSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Omit<OrgNotificationSettingsRow, "organization_id" | "updated_at" | "updated_by">
      >,
    ) => {
      const { data, error } = await supabase
        .from("org_notification_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["org_notification_settings", user?.organizationId] }),
  });
}

export type TelegramBoundChatRow = Tables["telegram_bound_chats"]["Row"];

export function useTelegramBoundChats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["telegram_bound_chats", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<TelegramBoundChatRow[]> => {
      const { data, error } = await supabase
        .from("telegram_bound_chats")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .order("bound_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUnbindTelegramChat() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("telegram_bound_chats").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["telegram_bound_chats", user?.organizationId] }),
  });
}

// Generates a one-time /bind code for connecting a Telegram group or
// channel — server-side (service role), same pattern as useLinkTelegram
// for a personal chat, since the code has to be looked up by the webhook
// without any RLS-visible table backing it from the client.
export function useLinkTelegramGroup() {
  return useMutation({
    mutationFn: async (): Promise<{ code: string; botUsername: string | null }> => {
      const res = await apiFetch("/telegram/link-group", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate a link code");
      return json;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Security Center — per-org password policy + 2FA-required flag.      */
/* ------------------------------------------------------------------ */

export type SecuritySettingsRow = Tables["security_settings"]["Row"];

const DEFAULT_SECURITY_SETTINGS: Omit<SecuritySettingsRow, "organization_id"> = {
  min_password_length: 8,
  require_number: false,
  require_uppercase: false,
  require_symbol: false,
  two_factor_required: false,
  updated_at: "",
  updated_by: null,
};

/** Falls back to the platform default policy when the org hasn't saved custom settings yet. */
export function useSecuritySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["security_settings", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<SecuritySettingsRow> => {
      const { data, error } = await supabase
        .from("security_settings")
        .select("*")
        .eq("organization_id", user!.organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? { organization_id: user!.organizationId!, ...DEFAULT_SECURITY_SETTINGS };
    },
  });
}

export function useUpdateSecuritySettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          SecuritySettingsRow,
          | "min_password_length"
          | "require_number"
          | "require_uppercase"
          | "require_symbol"
          | "two_factor_required"
        >
      >,
    ) => {
      const { data, error } = await supabase
        .from("security_settings")
        .upsert(
          { organization_id: user!.organizationId!, ...patch, updated_by: user?.id ?? null },
          { onConflict: "organization_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["security_settings", user?.organizationId] }),
  });
}

export type SecurityUserStatus = {
  id: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

/** Login activity + block status for the org's employees — lives on auth.users, so it's fetched via a service-role route rather than a direct table read. */
export function useSecurityUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["security_users", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    queryFn: async (): Promise<SecurityUserStatus[]> => {
      const res = await apiFetch("/admin/security-users");
      const json = (await res.json()) as { users?: SecurityUserStatus[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load login activity.");
      return json.users ?? [];
    },
  });
}

export function useToggleUserBan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const res = await apiFetch("/admin/security-ban", {
        method: "POST",
        body: JSON.stringify({ userId, ban }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not update the account.");
      return json;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["security_users", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* AmoCRM import settings — pick which pipelines/operators to sync.    */
/* ------------------------------------------------------------------ */

export type AmoCatalogPipeline = { id: number; name: string; is_main: boolean };
export type AmoCatalogOperator = {
  id: number;
  name: string;
  email: string | null;
  existingProfileEmail: string | null;
};
export type AmoCatalog = {
  subdomain: string;
  pipelines: AmoCatalogPipeline[];
  operators: AmoCatalogOperator[];
  enabledPipelineIds: number[] | null;
  enabledUserIds: number[] | null;
};

export function useAmoCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_catalog", user?.organizationId],
    enabled:
      !!user?.organizationId && (user.role === "super_admin" || user.role === "platform_owner"),
    queryFn: async (): Promise<AmoCatalog> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      // The server side of this call makes several live AmoCRM API
      // requests with their own retry/backoff -- bound the whole round
      // trip here too, so a genuinely stuck AmoCRM connection surfaces as
      // a real error on this page instead of leaving it on "Yuklanmoqda…"
      // forever with no way to tell a hang apart from "still working."
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      let res: Response;
      try {
        res = await fetch("/admin/amocrm-catalog", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("AmoCRM javob bermadi (timeout). Qayta urinib ko'ring.");
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const json = (await res.json()) as AmoCatalog & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load AmoCRM catalog.");
      return json;
    },
  });
}

export function useSaveAmoImportSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ pipelineIds, userIds }: { pipelineIds: number[]; userIds: number[] }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/admin/amocrm-import-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pipelineIds, userIds }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      return json;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["amocrm_catalog", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Tags — aggregated across every lead, with rename/delete that touch  */
/* every lead carrying that tag.                                       */
/* ------------------------------------------------------------------ */

export type TagSummary = { name: string; count: number };

export function useTagsSummary(funnel?: string | null) {
  const { data: leads, ...rest } = useLeadsRaw();
  const tags = useMemo<TagSummary[]>(() => {
    const counts = new Map<string, number>();
    for (const l of leads ?? []) {
      if (funnel && (l.funnel || "Direct Sales") !== funnel) continue;
      for (const tag of l.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads, funnel]);
  return { tags, ...rest };
}

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data: leads, error: fetchErr } = await supabase
        .from("leads")
        .select("id, tags")
        .contains("tags", [from]);
      if (fetchErr) throw fetchErr;
      for (const lead of leads ?? []) {
        const next = Array.from(new Set((lead.tags ?? []).map((t) => (t === from ? to : t))));
        const { error } = await supabase.from("leads").update({ tags: next }).eq("id", lead.id);
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tag: string) => {
      const { data: leads, error: fetchErr } = await supabase
        .from("leads")
        .select("id, tags")
        .contains("tags", [tag]);
      if (fetchErr) throw fetchErr;
      for (const lead of leads ?? []) {
        const next = (lead.tags ?? []).filter((t) => t !== tag);
        const { error } = await supabase.from("leads").update({ tags: next }).eq("id", lead.id);
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Attendance — manual clock-in/out and call logging, aggregated into  */
/* a per-employee daily roster. A future telephony integration can     */
/* insert into call_logs the same way and this keeps working as-is.    */
/* ------------------------------------------------------------------ */

export type WorkSessionRow = Tables["work_sessions"]["Row"];
export type CallLogRow = Tables["call_logs"]["Row"];

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function isToday(iso: string): boolean {
  return isSameDay(iso, new Date());
}

export function useMyOpenSession() {
  const { user } = useAuth();
  const { data: sessions, ...rest } = useWorkSessionsRaw({ enabled: !!user });
  const open = (sessions ?? []).find(
    (s) => s.profile_id === user?.id && !s.clock_out && isToday(s.clock_in),
  );
  return { session: open ?? null, ...rest };
}

export function useClockIn() {
  const create = useCreateWorkSession();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      return create.mutateAsync({ profile_id: user.id });
    },
  });
}

export function useClockOut() {
  const update = useUpdateWorkSession();
  return useMutation({
    mutationFn: async (sessionId: string) =>
      update.mutateAsync({ id: sessionId, patch: { clock_out: new Date().toISOString() } }),
  });
}

export function useLogCall() {
  const create = useCreateCallLog();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      leadId?: string | null;
      contactId?: string | null;
      phone?: string;
      connected: boolean;
      durationSeconds: number;
    }) => {
      if (!user) throw new Error("Not signed in");
      return create.mutateAsync({
        profile_id: user.id,
        lead_id: input.leadId ?? null,
        contact_id: input.contactId ?? null,
        phone: input.phone ?? null,
        connected: input.connected,
        duration_seconds: input.durationSeconds,
      });
    },
  });
}

export type AttendanceRow = {
  profileId: string;
  managerId: string | null;
  name: string;
  initials: string;
  position: string;
  clockIn: string | null;
  clockOut: string | null;
  sessionMinutes: number;
  callsMade: number;
  callsConnected: number;
  totalCallMinutes: number;
};

// A call gap wider than this ends a continuous work stretch -- "Ish vaqti"
// means time actually spent working AmoCRM (calling), not the raw span from
// first call to last, which would count a long lunch/meeting gap as "work".
const AMO_CONTINUOUS_WORK_GAP_MS = 60 * 60 * 1000;

// Sums the duration of continuous call-activity stretches for one rep's day
// (calls must already be sorted ascending by occurred_at). A stretch keeps
// extending across calls less than the gap threshold apart; a bigger gap
// starts a new stretch. On today's date, a stretch still within the gap
// threshold of now is extended to now (they're still actively on a call
// streak), so "Ish vaqti" keeps counting up live during the day.
function continuousAmoWorkMinutes(calls: AmoCrmCallRow[], isToday: boolean): number {
  if (calls.length === 0) return 0;
  let total = 0;
  let segStart = new Date(calls[0]!.occurred_at).getTime();
  let segEnd = segStart + calls[0]!.duration_seconds * 1000;
  for (let i = 1; i < calls.length; i++) {
    const start = new Date(calls[i]!.occurred_at).getTime();
    const end = start + calls[i]!.duration_seconds * 1000;
    if (start - segEnd > AMO_CONTINUOUS_WORK_GAP_MS) {
      total += segEnd - segStart;
      segStart = start;
      segEnd = end;
    } else {
      segEnd = Math.max(segEnd, end);
    }
  }
  if (isToday && Date.now() - segEnd <= AMO_CONTINUOUS_WORK_GAP_MS) {
    segEnd = Date.now();
  }
  total += segEnd - segStart;
  return total / 60000;
}

export function useAttendanceView(
  asOf?: Date | null,
  overrides?: { sessions?: WorkSessionRow[] | undefined; calls?: CallLogRow[] | undefined },
) {
  const profiles = useProfilesRaw();
  const liveSessions = useWorkSessionsRaw();
  const liveCalls = useCallLogsRaw();
  const liveLeads = useLeadsRaw();
  const liveAmoCalls = useAmoCrmCallsRaw();
  const sessions = overrides?.sessions ?? liveSessions.data;
  const calls = overrides?.calls ?? liveCalls.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- asOf?.getTime() is the stable key
  const refDate = useMemo(() => asOf ?? new Date(), [asOf?.getTime()]);
  const today = isSameDay(new Date().toISOString(), refDate);

  const ownerIdByLeadId = useMemo(
    () => new Map((liveLeads.data ?? []).map((l) => [l.id, l.owner_id])),
    [liveLeads.data],
  );

  const rows = useMemo<AttendanceRow[]>(() => {
    return (profiles.data ?? []).map((p): AttendanceRow => {
      const mySessions = (sessions ?? []).filter(
        (s) => s.profile_id === p.id && isSameDay(s.clock_in, refDate),
      );
      const manualClockIn = mySessions[0]?.clock_in ?? null;
      const manualClockOut = mySessions[0]?.clock_out ?? null;

      // A rep rarely presses "Ishni boshlash" -- the real signal that they've
      // arrived and started working is their first AmoCRM call of the day.
      // Take whichever of manual clock-in / first call happened earliest, so
      // the manual button still counts when someone actually uses it.
      const myAmoCalls = (liveAmoCalls.data ?? [])
        .filter((c) => {
          const ownerId = c.lead_id ? ownerIdByLeadId.get(c.lead_id) : null;
          return ownerId === p.id && isSameDay(c.occurred_at, refDate);
        })
        .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
      const firstAmoCallAt = myAmoCalls[0]?.occurred_at ?? null;
      const lastAmoCallAt = myAmoCalls.length
        ? myAmoCalls[myAmoCalls.length - 1]!.occurred_at
        : null;

      const clockInCandidates = [manualClockIn, firstAmoCallAt].filter(
        (v): v is string => v != null,
      );
      const clockIn = clockInCandidates.length
        ? clockInCandidates.reduce((earliest, v) =>
            new Date(v).getTime() < new Date(earliest).getTime() ? v : earliest,
          )
        : null;
      // No manual clock-out yet: on a past day, the last call of the day is
      // the best guess for when they stopped; today, the workday is still
      // ongoing so session length is measured up to now instead.
      const clockOut = manualClockOut ?? (today ? null : lastAmoCallAt);

      // "Ish vaqti" is about AmoCRM call activity, not office arrival --
      // once there's any call data for the day, it wins over the manual
      // clock session entirely (continuous stretches, gaps excluded). The
      // manual clock-in/out span is only a fallback for a day with no
      // AmoCRM calls at all.
      const sessionMinutes =
        myAmoCalls.length > 0
          ? continuousAmoWorkMinutes(myAmoCalls, today)
          : clockIn
            ? Math.max(
                0,
                ((clockOut ? new Date(clockOut).getTime() : Date.now()) -
                  new Date(clockIn).getTime()) /
                  60000,
              )
            : 0;

      const myManualCalls = (calls ?? []).filter(
        (c) => c.profile_id === p.id && isSameDay(c.created_at, refDate),
      );
      const callsMade = myManualCalls.length + myAmoCalls.length;
      const callsConnected =
        myManualCalls.filter((c) => c.connected).length +
        myAmoCalls.filter((c) => c.connected).length;
      const totalCallMinutes = Math.round(
        (myManualCalls.reduce((s, c) => s + c.duration_seconds, 0) +
          myAmoCalls.reduce((s, c) => s + c.duration_seconds, 0)) /
          60,
      );

      return {
        profileId: p.id,
        managerId: p.manager_id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        position: p.position,
        clockIn,
        clockOut,
        sessionMinutes: Math.round(sessionMinutes),
        callsMade,
        callsConnected,
        totalCallMinutes,
      };
    });
  }, [profiles.data, sessions, calls, liveAmoCalls.data, ownerIdByLeadId, refDate, today]);

  return {
    rows,
    isLoading:
      profiles.isLoading || liveSessions.isLoading || liveCalls.isLoading || liveLeads.isLoading,
  };
}

/* ------------------------------------------------------------------ */
/* Call pickup by hour — when do customers actually answer, and what    */
/* hour range is most effective for reps to be calling in. Shared by    */
/* Lid tahlili and Boshqaruv paneli (CallPickupByHourCard).             */
/* ------------------------------------------------------------------ */

export type HourPickupRow = {
  hour: number; // 0-23, local time
  total: number;
  connected: number;
  rate: number; // 0-100, percent of `total` that connected
};

// A single connected call at 3am shouldn't win "best hour" over 40 calls at
// 60% during the day -- require some minimum volume before an hour is
// eligible, falling back to whatever volume exists if the whole day is thin.
const BEST_HOUR_MIN_SAMPLE = 3;

export function useCallPickupByHour(range: { from: Date | null; to: Date | null } | null) {
  const { data: calls, isLoading: callsLoading } = useAmoCrmCallsSince(range);
  const { data: leads, isLoading: leadsLoading } = useLeadsRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  const ownerIdByLeadId = useMemo(
    () => new Map((leads ?? []).map((l) => [l.id, l.owner_id])),
    [leads],
  );

  const rows = useMemo<HourPickupRow[]>(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, connected: 0 }));
    for (const c of calls ?? []) {
      const ownerId = c.lead_id ? ownerIdByLeadId.get(c.lead_id) : null;
      if (visibleOwnerIds && (!ownerId || !visibleOwnerIds.has(ownerId))) continue;
      const bucket = buckets[new Date(c.occurred_at).getHours()]!;
      bucket.total += 1;
      if (c.connected) bucket.connected += 1;
    }
    return buckets.map((b) => ({
      ...b,
      rate: b.total > 0 ? Math.round((b.connected / b.total) * 1000) / 10 : 0,
    }));
  }, [calls, ownerIdByLeadId, visibleOwnerIds]);

  const bestHour = useMemo(() => {
    const withVolume = rows.filter((r) => r.total > 0);
    if (withVolume.length === 0) return null;
    const eligible = withVolume.filter((r) => r.total >= BEST_HOUR_MIN_SAMPLE);
    const pool = eligible.length > 0 ? eligible : withVolume;
    return pool.reduce((best, r) => (r.rate > best.rate ? r : best), pool[0]!);
  }, [rows]);

  return { rows, bestHour, isLoading: callsLoading || leadsLoading };
}

/* ------------------------------------------------------------------ */
/* Normativlar (quotas) — real revenue vs. each employee's daily/       */
/* monthly target from profiles + deals, no new tables needed.          */
/* ------------------------------------------------------------------ */

export type NormativeStatus = "onTrack" | "atRisk" | "behind";

export type NormativeRow = {
  profileId: string;
  name: string;
  initials: string;
  department: string;
  dailyTarget: number | null;
  monthlyTarget: number | null;
  revenueToday: number;
  revenueMonth: number;
  monthlyPct: number;
  pacePct: number;
  status: NormativeStatus;
};

export function useNormativesView() {
  const { user } = useAuth();
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  // Revenue used to come from the `deals` table — but this AmoCRM-synced
  // setup never populates deals (leads carry the real revenue), so every
  // rep's revenueToday/revenueMonth here was silently always 0. Compute it
  // from won leads instead, same as Dashboard/Reyting already do. Leads
  // have no close_date of their own, so updated_at is used as a proxy for
  // "when it closed" — the same snapshot-proxy approach used elsewhere in
  // this schema (there's no per-lead stage-change history to read instead).
  const { data: leads, isLoading: leadsLoading } = useLeadsRaw();
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();

  const rows = useMemo<NormativeRow[]>(() => {
    const stagesById = byId(stages);
    const wonLeads = (leads ?? []).filter((l) => {
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      return stage?.is_won ?? false;
    });
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expectedPaceFraction = dayOfMonth / daysInMonth;

    // Super admins see the whole company. A ROP sees their own reports; a
    // sotuv_menejeri sees every teammate under the same ROP (including
    // themselves) so they can see who's ahead/behind, per spec — not the
    // full company.
    const roster = (profiles ?? []).filter((p) => {
      if (p.role === "super_admin" || p.role === "platform_owner") return false;
      if (!user || user.role === "super_admin" || user.role === "platform_owner") return true;
      if (user.role === "rop") return p.manager_id === user.id;
      return p.manager_id === user.managerId;
    });

    return roster.map((p): NormativeRow => {
      const won = wonLeads.filter((l) => l.owner_id === p.id);
      const revenueToday = won
        .filter((l) => new Date(l.updated_at) >= startOfToday)
        .reduce((s, l) => s + Number(l.expected_revenue), 0);
      const revenueMonth = won
        .filter((l) => new Date(l.updated_at) >= startOfMonth)
        .reduce((s, l) => s + Number(l.expected_revenue), 0);
      const monthlyTarget = p.monthly_target;
      const monthlyPct =
        monthlyTarget && monthlyTarget > 0
          ? Math.round((revenueMonth / monthlyTarget) * 1000) / 10
          : 0;
      const expectedByNow = monthlyTarget ? monthlyTarget * expectedPaceFraction : 0;
      const pacePct =
        expectedByNow > 0 ? Math.round((revenueMonth / expectedByNow) * 1000) / 10 : 0;
      const status: NormativeStatus =
        pacePct >= 90 ? "onTrack" : pacePct >= 60 ? "atRisk" : "behind";
      return {
        profileId: p.id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        department: p.department,
        dailyTarget: p.daily_target,
        monthlyTarget: p.monthly_target,
        revenueToday,
        revenueMonth,
        monthlyPct,
        pacePct,
        status,
      };
    });
  }, [profiles, leads, stages, user]);

  return { rows, isLoading: profilesLoading || leadsLoading || stagesLoading };
}

/* ------------------------------------------------------------------ */
/* Jarimalar (fines) — admin-managed fine types (per org) + the actual  */
/* fine records, normally written by the daily AI cron but also        */
/* addable by hand. Same roster-scoping rule as Normativ (super_admin  */
/* sees everyone, a ROP sees their team, a rep sees their team too so   */
/* they can see where they stand).                                     */
/* ------------------------------------------------------------------ */

export type FineTypeRow = Tables["fine_types"]["Row"];
const fineTypesResource = makeResource("fine_types", ["fine_types"]);
export const useFineTypes = (opts?: Parameters<typeof fineTypesResource.useList>[0]) =>
  fineTypesResource.useList({ orderBy: "position", ...opts });
export const useCreateFineType = fineTypesResource.useCreate;
export const useUpdateFineType = fineTypesResource.useUpdate;
export const useDeleteFineType = fineTypesResource.useRemove;

export type FineRow = Tables["fines"]["Row"];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function useRosterScope() {
  const { user } = useAuth();
  const { data: profiles, isLoading } = useProfilesRaw();
  const roster = useMemo(() => {
    return (profiles ?? []).filter((p) => {
      if (p.role === "super_admin" || p.role === "platform_owner") return false;
      if (!user || user.role === "super_admin" || user.role === "platform_owner") return true;
      if (user.role === "rop") return p.manager_id === user.id;
      return p.manager_id === user.managerId;
    });
  }, [profiles, user]);
  return { roster, isLoading };
}

export function useFinesInRange(range: { from: Date | null; to: Date | null }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fines", user?.organizationId, range.from?.getTime(), range.to?.getTime()],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<FineRow[]> => {
      let query = supabase.from("fines").select("*").eq("organization_id", user!.organizationId!);
      if (range.from) query = query.gte("occurred_on", toDateOnly(range.from));
      if (range.to) query = query.lte("occurred_on", toDateOnly(range.to));
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateFine() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      fineTypeId: string;
      profileId: string;
      amount: number;
      occurredOn: string;
      reason?: string | undefined;
    }) => {
      const { error } = await supabase.from("fines").insert({
        organization_id: user!.organizationId!,
        fine_type_id: input.fineTypeId,
        profile_id: input.profileId,
        amount: input.amount,
        occurred_on: input.occurredOn,
        reason: input.reason ?? null,
        source: "manual",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fines"] }),
  });
}

export function useDeleteFine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fines").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fines"] }),
  });
}

export type FinesMatrixRow = {
  profileId: string;
  name: string;
  initials: string;
  amountsByType: Record<string, number>;
  total: number;
};

export function useFinesMatrix(range: { from: Date | null; to: Date | null }) {
  const { roster, isLoading: rosterLoading } = useRosterScope();
  const { data: fineTypes, isLoading: typesLoading } = useFineTypes();
  const { data: fines, isLoading: finesLoading } = useFinesInRange(range);

  const rows = useMemo<FinesMatrixRow[]>(() => {
    return roster.map((p): FinesMatrixRow => {
      const mine = (fines ?? []).filter((f) => f.profile_id === p.id);
      const amountsByType: Record<string, number> = {};
      for (const f of mine) {
        amountsByType[f.fine_type_id] = (amountsByType[f.fine_type_id] ?? 0) + Number(f.amount);
      }
      return {
        profileId: p.id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        amountsByType,
        total: mine.reduce((s, f) => s + Number(f.amount), 0),
      };
    });
  }, [roster, fines]);

  return {
    rows,
    fineTypes: fineTypes ?? [],
    isLoading: rosterLoading || typesLoading || finesLoading,
  };
}

/* ------------------------------------------------------------------ */
/* KPI lar — per-rep performance readout for the selected period: what */
/* each rep is doing well (conversion, sales, calls, meetings), used   */
/* for monthly pay/bonus review so it's computed deterministically     */
/* from the same synced data every other page uses, not guessed by AI. */
/* ------------------------------------------------------------------ */

export type KpiRow = {
  profileId: string;
  name: string;
  initials: string;
  callsMade: number;
  callsConnected: number;
  totalCallMinutes: number;
  totalLeads: number;
  salesCount: number;
  revenue: number;
  conversionPct: number;
  meetingsCount: number;
};

const MEETING_TAG_HINTS = ["uchrashuv", "ofis", "meeting"];

function isInRange(iso: string | null, range: { from: Date | null; to: Date | null }): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t > range.to.getTime()) return false;
  return true;
}

export function useKpiView(range: { from: Date | null; to: Date | null }) {
  const { roster, isLoading: rosterLoading } = useRosterScope();
  const { data: leads, isLoading: leadsLoading } = useLeadsRaw();
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const { data: calls, isLoading: callsLoading } = useCallLogsRaw();

  const rows = useMemo<KpiRow[]>(() => {
    const stagesById = byId(stages);
    return roster.map((p): KpiRow => {
      const myLeads = (leads ?? []).filter(
        (l) => l.owner_id === p.id && isInRange(l.updated_at, range),
      );
      const won = myLeads.filter((l) => {
        const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
        return stage?.is_won ?? false;
      });
      const meetingsCount = myLeads.filter((l) =>
        (l.tags ?? []).some((tag) =>
          MEETING_TAG_HINTS.some((hint) => tag.toLowerCase().includes(hint)),
        ),
      ).length;
      const myCalls = (calls ?? []).filter(
        (c) => c.profile_id === p.id && isInRange(c.created_at, range),
      );
      return {
        profileId: p.id,
        name: profileName(p),
        initials: initialsOf(p.full_name || p.email),
        callsMade: myCalls.length,
        callsConnected: myCalls.filter((c) => c.connected).length,
        totalCallMinutes: Math.round(myCalls.reduce((s, c) => s + c.duration_seconds, 0) / 60),
        totalLeads: myLeads.length,
        salesCount: won.length,
        revenue: won.reduce((s, l) => s + Number(l.expected_revenue), 0),
        conversionPct:
          myLeads.length > 0 ? Math.round((won.length / myLeads.length) * 1000) / 10 : 0,
        meetingsCount,
      };
    });
  }, [roster, leads, stages, calls, range]);

  return {
    rows,
    isLoading: rosterLoading || leadsLoading || stagesLoading || callsLoading,
  };
}

/* ------------------------------------------------------------------ */
/* Telegram "hisobotchi_bot" — link-code flow + daily report send.     */
/* ------------------------------------------------------------------ */

export function useLinkTelegram() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<{ code: string; botUsername: string | null }> => {
      const res = await apiFetch("/telegram/link", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate a link code");
      return json;
    },
    onSuccess: () => void refreshProfile(),
  });
}

export function useSendTestReport() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/telegram/send-test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");
      return json;
    },
  });
}

export function usePublishFines() {
  return useMutation({
    mutationFn: async (range: { from: string | null; to: string | null; label: string }) => {
      const res = await apiFetch("/fines/publish", {
        method: "POST",
        body: JSON.stringify(range),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to publish");
      return json;
    },
  });
}

export function useGenerateDailyReportNow() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<{ sent: number; failed: number }> => {
      const res = await apiFetch("/daily-report-settings/generate-now", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Hisobotni yaratib bo'lmadi.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily_report_history", user?.organizationId] });
      void qc.invalidateQueries({ queryKey: ["daily_report_preview", user?.organizationId] });
    },
  });
}

// A private AmoCRM integration is created inside one specific account and
// can't be installed from a different one -- a platform with several
// companies, each running its own AmoCRM account, needs one client_id/secret
// pair per organization. Read-modify-write, then upsert (not a blind
// update): a company setting this up before ever connecting AmoCRM has no
// integration_settings row yet, and a plain .update() silently matches zero
// rows in that case -- it "succeeds" without persisting anything. The
// read+merge still avoids clobbering subdomain/last_synced_at/lead_count,
// which the OAuth callback and sync routes write into the same config
// column, for orgs that already have a row.
export function useSetAmoCrmCredentials() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { clientId: string; clientSecret: string }) => {
      const { data: existing, error: fetchError } = await supabase
        .from("integration_settings")
        .select("config")
        .eq("organization_id", user!.organizationId!)
        .eq("key", "amocrm")
        .maybeSingle();
      if (fetchError) throw new Error(fetchError.message);
      const currentConfig = (existing?.config as Record<string, unknown> | null) ?? {};
      const { error } = await supabase.from("integration_settings").upsert(
        {
          organization_id: user!.organizationId!,
          key: "amocrm",
          config: {
            ...currentConfig,
            client_id: input.clientId.trim(),
            client_secret: input.clientSecret.trim(),
          },
        },
        { onConflict: "organization_id,key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["integration_settings", "amocrm"] }),
  });
}

export function useSetTelegramBotUsername() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (username: string) => {
      const { error } = await supabase.from("integration_settings").upsert(
        {
          organization_id: user!.organizationId!,
          key: "telegram_bot",
          config: { username },
          enabled: true,
        },
        { onConflict: "organization_id,key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["integration_settings", "telegram_bot"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Office location — a single precise address (OpenStreetMap search/    */
/* embed, no maps API key needed) shown in the header, admin-editable.  */
/* ------------------------------------------------------------------ */

export type OfficeLocationConfig = { label: string; address: string; lat: number; lon: number };

export function useSetOfficeLocation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (config: OfficeLocationConfig) => {
      const { error } = await supabase
        .from("integration_settings")
        .upsert(
          { organization_id: user!.organizationId!, key: "office_location", config, enabled: true },
          { onConflict: "organization_id,key" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["integration_settings", "office_location"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Error logs — everything caught by the global client-side handlers   */
/* and server routes, surfaced in Admin Panel so issues get fixed fast.*/
/* ------------------------------------------------------------------ */

export type ErrorLogRow = Tables["error_logs"]["Row"];
const errorLogsResource = makeResource("error_logs", ["error_logs"]);

export const useErrorLogsRaw = (opts?: Parameters<typeof errorLogsResource.useList>[0]) =>
  errorLogsResource.useList({ orderBy: "created_at", ascending: false, ...opts });
export const useResolveErrorLog = errorLogsResource.useUpdate;

/* ------------------------------------------------------------------ */
/* Auto-responders — admin-configured "ask this, save the answer to    */
/* this CRM field" scripts. Config only: actually sending needs a      */
/* connected messaging channel, which isn't wired up yet.              */
/* ------------------------------------------------------------------ */

export type AutoResponderRow = Tables["auto_responders"]["Row"];
const autoRespondersResource = makeResource("auto_responders", ["auto_responders"]);

export const useAutoRespondersRaw = (opts?: Parameters<typeof autoRespondersResource.useList>[0]) =>
  autoRespondersResource.useList({ orderBy: "created_at", ascending: false, ...opts });
export const useCreateAutoResponder = autoRespondersResource.useCreate;
export const useUpdateAutoResponder = autoRespondersResource.useUpdate;
export const useDeleteAutoResponder = autoRespondersResource.useRemove;

/* ------------------------------------------------------------------ */
/* AI Agents — two fixed presets (chat / call analysis). Config only:  */
/* actually running one needs a live model API key wired up server-    */
/* side, which this workspace does not have yet — the UI says so.      */
/* ------------------------------------------------------------------ */

export type AiAgentRow = Tables["ai_agents"]["Row"];

export function useAiAgents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai_agents", user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<AiAgentRow[]> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("organization_id", user!.organizationId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateAiAgent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: {
      kind: "chat" | "call";
      model?: string | undefined;
      system_prompt?: string | undefined;
      channels?: string[] | undefined;
      active?: boolean | undefined;
      call_instructions?: Record<string, unknown> | undefined;
    }) => {
      // Goes through a server route (service-role write) instead of a
      // direct client upsert -- ai_agents_write kept rejecting a confirmed
      // super_admin's own-org write with "violates row-level security
      // policy" across two policy-shape fixes, so this sidesteps that
      // mystery entirely rather than depending on it being solved.
      const res = await apiFetch("/admin/ai-agents/update", {
        method: "POST",
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Save failed (${res.status})`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai_agents", user?.organizationId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Which funnel (pipeline) names are enabled for import — every funnel  */
/* filter in the app (sidebar, Dashboard, Reyting, Funnels, AmoCRM      */
/* board) consults this so a pipeline unchecked in "Import qilinadigan  */
/* voronkalar" never appears as a filter option. null = no restriction. */
/* ------------------------------------------------------------------ */

export function useEnabledFunnelNames(): Set<string> | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["enabled_funnel_names", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase.rpc("enabled_funnel_names");
      if (error) throw error;
      return data ?? null;
    },
  });
  return useMemo(() => (data ? new Set(data) : null), [data]);
}

/* ------------------------------------------------------------------ */
/* Distinct funnel names — for the sidebar's expandable Funnels group. */
/* ------------------------------------------------------------------ */

export function useFunnelNames() {
  const { data: leads, isLoading } = useLeadsRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const enabledFunnels = useEnabledFunnelNames();
  const names = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads ?? []) {
      if (visibleOwnerIds && !(l.owner_id && visibleOwnerIds.has(l.owner_id))) continue;
      const name = l.funnel || "Direct Sales";
      if (enabledFunnels && !enabledFunnels.has(name)) continue;
      set.add(name);
    }
    return Array.from(set).sort();
  }, [leads, visibleOwnerIds, enabledFunnels]);
  return { names, isLoading };
}

/* ------------------------------------------------------------------ */
/* Funnel-level stat cards (Reyting) — computed directly from the raw   */
/* leads table rather than summed across per-manager leaderboard rows,  */
/* so a lead with no (or an unmatched) owner still counts toward the    */
/* funnel's totals instead of silently vanishing from the sum.          */
/* ------------------------------------------------------------------ */

// AmoCRM stage names are whatever the org typed into their own pipeline, and
// vary funnel to funnel -- confirmed real-world variants (per the user):
//   Prepayment:   "Predoplata", "Predoplata qildi", "Predoplata qildi |
//                 kelishuv bor", and the observed misspelling "Peredoplata"
//   Half payment: always "Yarim to'lov"
//   Full payment: "To'liq to'lov qildi", "WON | To'liq to'lov",
//                 "Успешно реализовано" (ru), or bare "WON"
//   Exception:    some funnels use "ROP Closed" in place of a full-payment
//                 stage -- counts as a sale too when it shows up
// Matched loosely (lowercased, apostrophes stripped) against any of these
// as a substring, not an exact string.
export const SALES_STAGE_KEYWORDS = [
  "predoplata",
  "peredoplata",
  "yarim",
  "toliq",
  "won",
  "успешно",
  "rop closed",
];

export function normalizeStageName(name: string): string {
  return name.toLowerCase().replace(/['’ʼ`]/g, "");
}

export type FunnelStats = {
  totalLeads: number;
  totalRevenue: number;
  wonCount: number;
  wonRevenue: number;
  lostCount: number;
  // Real, AI-verdict-based counterpart to the old "lost revenue" formula
  // (lostCount * a flat 15% guess * avgCheck) -- count/sum of only the
  // lost leads a call analysis actually flagged as recoverable
  // (leads.recoverable = true), never a blanket estimate over every lost
  // lead regardless of whether it has any real chance.
  recoverableCount: number;
  recoverableRevenue: number;
  salesStageCount: number;
  salesStageRevenue: number;
  // Average deal size across sales-stage leads only (salesStageRevenue /
  // salesStageCount) -- the "o'rtacha chek" the Dashboard's projection cards
  // are built from.
  avgCheck: number;
  conversion: number;
  isLoading: boolean;
};

export function useFunnelStats(
  funnel?: string | null,
  opts?: { overrideLeads?: LeadRow[] | undefined },
): FunnelStats {
  const useOverride = !!opts?.overrideLeads;
  const { data: liveLeads, isLoading: liveLeadsLoading } = useFunnelScopedLeads(
    funnel ?? null,
    !useOverride,
  );
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const leads = useOverride ? opts?.overrideLeads : liveLeads;
  const leadsLoading = useOverride ? false : liveLeadsLoading;

  return useMemo(() => {
    const stagesById = byId(stages);
    const scoped = visibleOwnerIds
      ? (leads ?? []).filter((l) => !!l.owner_id && visibleOwnerIds.has(l.owner_id))
      : (leads ?? []);
    let totalLeads = 0;
    let totalRevenue = 0;
    let wonCount = 0;
    let wonRevenue = 0;
    let lostCount = 0;
    let recoverableCount = 0;
    let recoverableRevenue = 0;
    let salesStageCount = 0;
    let salesStageRevenue = 0;

    for (const l of scoped) {
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      totalLeads += 1;
      totalRevenue += l.expected_revenue;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      if (stage?.is_won) {
        wonCount += 1;
        wonRevenue += l.expected_revenue;
      }
      if (stage?.is_lost) {
        lostCount += 1;
        if (l.recoverable === true) {
          recoverableCount += 1;
          recoverableRevenue += l.expected_revenue;
        }
      }
      const stageName = stage ? normalizeStageName(stage.name) : "";
      if (SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        salesStageCount += 1;
        salesStageRevenue += l.expected_revenue;
      }
    }

    return {
      totalLeads,
      totalRevenue,
      wonCount,
      wonRevenue,
      lostCount,
      recoverableCount,
      recoverableRevenue,
      salesStageCount,
      salesStageRevenue,
      avgCheck: salesStageCount ? salesStageRevenue / salesStageCount : 0,
      // Sales-stage count (prepayment/half-payment/full-payment), not WON --
      // this is "Umumiy konversiya" as specified, distinct from the WON-only
      // ratio a plain won/total conversion would give.
      conversion: totalLeads ? (salesStageCount / totalLeads) * 100 : 0,
      isLoading: leadsLoading || stagesLoading,
    };
  }, [leads, stages, funnel, leadsLoading, stagesLoading, visibleOwnerIds]);
}

/* ------------------------------------------------------------------ */
/* Today's per-funnel call activity (Dashboard "Kunlik calltime" card)  */
/* — how many managers made at least one call today in this funnel, how */
/* much total/average talk time, and how many distinct leads each       */
/* manager reached on average.                                          */
/* ------------------------------------------------------------------ */

export type FunnelCallStats = {
  managerCount: number;
  totalSeconds: number;
  avgSecondsPerManager: number;
  avgContactsPerManager: number;
  isLoading: boolean;
};

export function useFunnelCallStats(funnel?: string | null): FunnelCallStats {
  const { data: calls, isLoading: callsLoading } = useAmoCrmCallsRaw();
  const { data: leads, isLoading: leadsLoading } = useLeadsRaw();
  const visibleOwnerIds = useVisibleOwnerIds();

  return useMemo(() => {
    const leadsById = byId(leads);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Every call's duration/contact counts toward the card's totals as long
    // as it resolves to a lead (regardless of whether that lead has an
    // owner_id) -- a call shouldn't vanish from "today's activity" just
    // because its lead's AmoCRM responsible user didn't map to a SalesIQ
    // profile. managerCount/per-manager averages still need a real owner_id
    // to attribute to someone, so those are tracked separately. That only
    // holds for an unrestricted view though -- a rop/sotuv_menejeri's "my
    // team's activity today" card must never count a call it can't confirm
    // belongs to someone visible to them, unattributed or not.
    const byManager = new Map<string, { seconds: number; leadIds: Set<string> }>();
    let totalSeconds = 0;
    const allContacts = new Set<string>();
    for (const c of calls ?? []) {
      if (new Date(c.occurred_at) < startOfToday) continue;
      if (!c.lead_id) continue;
      const lead = leadsById.get(c.lead_id);
      if (visibleOwnerIds && (!lead?.owner_id || !visibleOwnerIds.has(lead.owner_id))) continue;
      const leadFunnel = lead?.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;

      totalSeconds += c.duration_seconds;
      allContacts.add(c.lead_id);

      if (!lead?.owner_id) continue;
      const cur = byManager.get(lead.owner_id) ?? { seconds: 0, leadIds: new Set<string>() };
      cur.seconds += c.duration_seconds;
      cur.leadIds.add(lead.id);
      byManager.set(lead.owner_id, cur);
    }

    const managerCount = byManager.size;

    return {
      managerCount,
      totalSeconds,
      avgSecondsPerManager: managerCount ? Math.round(totalSeconds / managerCount) : 0,
      avgContactsPerManager: managerCount
        ? Math.round((allContacts.size / managerCount) * 10) / 10
        : 0,
      isLoading: callsLoading || leadsLoading,
    };
  }, [calls, leads, funnel, callsLoading, leadsLoading, visibleOwnerIds]);
}

/* ------------------------------------------------------------------ */
/* Open AmoCRM task counts (Dashboard "zadachalar" card) — live-fetched, */
/* not stored locally, since this app never syncs AmoCRM's own task list */
/* in (it only ever pushes single reminder tasks out to AmoCRM).         */
/* ------------------------------------------------------------------ */

export type AmoTaskCardStats = { dueToday: number; overdue: number };

export function useAmoCrmTaskStats(funnel?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["amocrm_task_stats", user?.organizationId, funnel ?? null],
    enabled: !!user?.organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AmoTaskCardStats> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const params = new URLSearchParams();
      if (funnel) params.set("funnel", funnel);
      const res = await fetch(`/dashboard/amocrm-tasks?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as AmoTaskCardStats & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load AmoCRM tasks.");
      return { dueToday: json.dueToday, overdue: json.overdue };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Harakat kerak" tab. Computed entirely in SQL (see    */
/* lead_analytics_action RPC) since this runs over the org's full lead    */
/* table, not the small filtered slices useLeadsRaw()'s callers work with. */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsRecoverableRow = {
  lead_id: string;
  name: string;
  manager: string;
  days_since_closed: number;
  next_follow_up: string | null;
  value: number;
  reason: string | null;
};

export type LeadAnalyticsHotRow = {
  lead_id: string;
  name: string;
  manager: string;
  score: number;
  temperature: string;
  stage: string;
  value: number;
};

export type LeadAnalyticsOperatorRow = {
  manager: string;
  won_connected: number;
  won_attempts: number;
  lost_connected: number;
  lost_attempts: number;
};

export type LeadAnalyticsActionData = {
  totalLeads: number;
  avgConversion: number;
  hotLeads: number;
  churnRisk: number;
  // Real, AI-verdict-based counterparts to the old "recoverable" list's
  // length (which included every lost lead, assessed or not) -- these two
  // are the authoritative "how many / how much is actually still
  // winnable" numbers, computed server-side from leads.recoverable = true.
  recoverableCount: number;
  recoverableRevenue: number;
  recoverable: LeadAnalyticsRecoverableRow[];
  hotPipeline: LeadAnalyticsHotRow[];
  operatorActivity: LeadAnalyticsOperatorRow[];
};

export function useLeadAnalyticsAction(
  funnel: string | null,
  manager: string | null,
  since: Date | null,
  team: string | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_action",
      user?.organizationId,
      funnel,
      manager,
      since?.getTime(),
      team,
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsActionData> => {
      const { data, error } = await supabase.rpc("lead_analytics_action", {
        p_funnel: funnel,
        p_manager: manager,
        p_since: since ? since.toISOString() : null,
        p_team: team,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsActionData;
    },
  });
}

// Manager dropdown on Lead Analytics needs to cascade with the funnel
// filter too (not just the team/ROP filter it already had) -- this page
// has no client-side lead list to derive that from (everything else on
// it goes through SQL RPCs), so it's a small dedicated query instead.
export function useManagerIdsInFunnel(funnel: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["manager_ids_in_funnel", user?.organizationId, funnel],
    enabled: !!user?.organizationId && !!funnel,
    queryFn: async (): Promise<Set<string>> => {
      if (!funnel) return new Set();
      const { data, error } = await supabase
        .from("leads")
        .select("owner_id")
        .eq("funnel", funnel)
        .not("owner_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.owner_id as string));
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Lead sifati" tab. Per-tag aggregation, also SQL-side */
/* (unnest(leads.tags)) for the same scale reason as the action tab.      */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsTagResultRow = {
  tag: string;
  sold: number;
  lost: number;
  open: number;
  total: number;
};

export type LeadAnalyticsTagMatrixRow = {
  tag: string;
  total: number;
  avg_score: number | null;
  conversion: number | null;
  low_sample: boolean;
};

export type LeadAnalyticsTagCategoryRow = {
  tag: string;
  cold: number;
  warm: number;
  hot: number;
  very_hot: number;
};

export type LeadAnalyticsQualityData = {
  tagResults: LeadAnalyticsTagResultRow[];
  tagMatrix: LeadAnalyticsTagMatrixRow[];
  tagCategories: LeadAnalyticsTagCategoryRow[];
};

export function useLeadAnalyticsQuality(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_quality",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsQualityData> => {
      const { data, error } = await supabase.rpc("lead_analytics_quality", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsQualityData;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Hozirgi holat" tab. Same SQL-side-aggregation reasoning */
/* as the other two lead_analytics_* hooks.                                 */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsStageRow = {
  stage: string;
  lead_count: number;
  avg_days: number | null;
};

export type LeadAnalyticsManagerLoadRow = {
  manager: string;
  cold: number;
  warm: number;
  hot: number;
  very_hot: number;
  total: number;
};

export type LeadAnalyticsCurrentData = {
  temperature: { cold: number; warm: number; hot: number; veryHot: number };
  stages: LeadAnalyticsStageRow[];
  managerLoad: LeadAnalyticsManagerLoadRow[];
};

export function useLeadAnalyticsCurrent(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_current",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsCurrentData> => {
      const { data, error } = await supabase.rpc("lead_analytics_current", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsCurrentData;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Yo'nalish" tab. Same SQL-side-aggregation reasoning as */
/* the other three lead_analytics_* hooks.                                  */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsLostReasonRow = { reason: string; count: number };

export type LeadAnalyticsChurnRow = {
  lead_id: string;
  name: string;
  manager: string;
  days_since_contact: number | null;
  risk_percent: number;
  score: number;
  temperature: string;
};

export type LeadAnalyticsDirectionData = {
  direction: { closingSoon: number; neutral: number; losingSoon: number };
  lostReasons: LeadAnalyticsLostReasonRow[];
  churnRisk: LeadAnalyticsChurnRow[];
};

export function useLeadAnalyticsDirection(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_direction",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsDirectionData> => {
      const { data, error } = await supabase.rpc("lead_analytics_direction", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsDirectionData;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lead Analytics — "Marketing" tab. leads.source/campaign/utm existed    */
/* since the very first schema but nothing ever read them -- this is the */
/* first real "which channel is working" view. p_until (unlike the other */
/* 3 lead_analytics_* RPCs) lets the Oylik picker bound to exactly that   */
/* month, since CPL/ROI divides that month's leads by that month's       */
/* marketing_spend row -- an open-ended "since the 1st, to today" filter */
/* would silently inflate the lead count relative to the spend entered.  */
/* ------------------------------------------------------------------ */

export type LeadAnalyticsSourceRow = {
  source: string;
  total: number;
  won: number;
  lost: number;
  revenue: number;
  conversion: number | null;
};

export type LeadAnalyticsCampaignRow = {
  campaign: string;
  total: number;
  won: number;
  lost: number;
  revenue: number;
  conversion: number | null;
};

export type LeadAnalyticsQualityBySourceRow = {
  source: string;
  qualified: number;
  unqualified: number;
  unscored: number;
  total: number;
};

export type LeadAnalyticsLostReasonBySourceRow = {
  source: string;
  reason: string;
  count: number;
};

export type LeadAnalyticsSpeedBySourceRow = {
  source: string;
  avg_hours: number;
  sample_size: number;
};

export type LeadAnalyticsDailyTrendRow = {
  date: string;
  source: string;
  count: number;
};

export type LeadAnalyticsMarketingData = {
  bySource: LeadAnalyticsSourceRow[];
  byCampaign: LeadAnalyticsCampaignRow[];
  qualityBySource: LeadAnalyticsQualityBySourceRow[];
  lostReasonsBySource: LeadAnalyticsLostReasonBySourceRow[];
  speedBySource: LeadAnalyticsSpeedBySourceRow[];
  dailyTrend: LeadAnalyticsDailyTrendRow[];
};

export function useLeadAnalyticsMarketing(
  funnel: string | null,
  manager: string | null,
  team: string | null,
  since: Date | null,
  until: Date | null,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "lead_analytics_marketing",
      user?.organizationId,
      funnel,
      manager,
      team,
      since?.getTime(),
      until?.getTime(),
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadAnalyticsMarketingData> => {
      const { data, error } = await supabase.rpc("lead_analytics_marketing", {
        p_funnel: funnel,
        p_manager: manager,
        p_team: team,
        p_since: since ? since.toISOString() : null,
        p_until: until ? until.toISOString() : null,
      });
      if (error) throw error;
      return data as unknown as LeadAnalyticsMarketingData;
    },
  });
}

export type MarketingSpendRow = Tables["marketing_spend"]["Row"];

/** One row per org/source/campaign/month — entered manually since nothing
 *  in the schema tracks ad spend automatically. Scoped to a single month
 *  when `month` is given (matches the Marketing tab's CPL/ROI section,
 *  which only ever shows one month at a time), otherwise returns every row
 *  (used by the spend-management list).
 */
export function useMarketingSpend(month?: Date | null) {
  const { user } = useAuth();
  const monthKey = month ? month.toISOString().slice(0, 10) : null;
  return useQuery({
    queryKey: ["marketing_spend", user?.organizationId, monthKey],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<MarketingSpendRow[]> => {
      let query = supabase
        .from("marketing_spend")
        .select("*")
        .eq("organization_id", user!.organizationId!);
      if (monthKey) query = query.eq("month", monthKey);
      const { data, error } = await query.order("month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertMarketingSpend() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      source: string;
      campaign?: string;
      month: Date;
      amount: number;
    }) => {
      const monthKey = new Date(input.month.getFullYear(), input.month.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const { error } = await supabase.from("marketing_spend").upsert(
        {
          organization_id: user!.organizationId!,
          source: input.source.trim(),
          campaign: input.campaign?.trim() ?? "",
          month: monthKey,
          amount: input.amount,
          created_by: user!.id,
        },
        { onConflict: "organization_id,source,campaign,month" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["marketing_spend", user?.organizationId] }),
  });
}

export function useDeleteMarketingSpend() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_spend").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["marketing_spend", user?.organizationId] }),
  });
}

/**
 * "Hisobotni olish" -- an on-demand, full-page snapshot of Lid tahlili for
 * whatever funnel/team/operator/period is selected in the top filter bar,
 * as one combined report the caller can read or copy. Fetches all 5
 * lead_analytics_* RPCs in parallel with the *client's own session* (not a
 * server route on the service-role key) so each RPC's built-in
 * super_admin/rop/self scoping applies exactly as it already does for the
 * 5 tabs themselves -- a rep clicking this button gets a report of their
 * own leads only, a ROP gets their team's, matching the page they're
 * looking at.
 */
export type LeadAnalyticsFullReportData = {
  action: LeadAnalyticsActionData;
  quality: LeadAnalyticsQualityData;
  current: LeadAnalyticsCurrentData;
  direction: LeadAnalyticsDirectionData;
  marketing: LeadAnalyticsMarketingData;
};

export function useGenerateLeadAnalyticsReport() {
  return useMutation({
    mutationFn: async (input: {
      funnel: string | null;
      manager: string | null;
      team: string | null;
      since: Date | null;
      until: Date | null;
    }): Promise<LeadAnalyticsFullReportData> => {
      const sinceIso = input.since ? input.since.toISOString() : null;
      const untilIso = input.until ? input.until.toISOString() : null;
      const [actionRes, qualityRes, currentRes, directionRes, marketingRes] = await Promise.all([
        supabase.rpc("lead_analytics_action", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_since: sinceIso,
          p_team: input.team,
        }),
        supabase.rpc("lead_analytics_quality", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
        }),
        supabase.rpc("lead_analytics_current", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
        }),
        supabase.rpc("lead_analytics_direction", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
        }),
        supabase.rpc("lead_analytics_marketing", {
          p_funnel: input.funnel,
          p_manager: input.manager,
          p_team: input.team,
          p_since: sinceIso,
          p_until: untilIso,
        }),
      ]);
      if (actionRes.error) throw actionRes.error;
      if (qualityRes.error) throw qualityRes.error;
      if (currentRes.error) throw currentRes.error;
      if (directionRes.error) throw directionRes.error;
      if (marketingRes.error) throw marketingRes.error;
      return {
        action: actionRes.data as unknown as LeadAnalyticsActionData,
        quality: qualityRes.data as unknown as LeadAnalyticsQualityData,
        current: currentRes.data as unknown as LeadAnalyticsCurrentData,
        direction: directionRes.data as unknown as LeadAnalyticsDirectionData,
        marketing: marketingRes.data as unknown as LeadAnalyticsMarketingData,
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Per-manager funnel stats (Reyting live-ranking table) — same raw-lead */
/* computation as useFunnelStats above, grouped by owner instead of      */
/* summed across the whole funnel.                                       */
/* ------------------------------------------------------------------ */

export type ManagerFunnelStats = { totalLeads: number; salesCount: number; salesRevenue: number };

export function useManagerFunnelStats(
  funnel?: string | null,
  opts?: {
    overrideLeads?: LeadRow[] | undefined;
    refetchInterval?: number | false;
  },
): Map<string, ManagerFunnelStats> {
  // Without this, the Reyting page's "Jonli" (live) poll only refetched
  // leaderboard_stats (used purely to pick the initial sort order) while the
  // revenue numbers actually shown here -- sourced from this hook's own
  // useLeadsRaw() -- sat on whatever staleTime last left them, never
  // visibly updating despite the live badge.
  const { data: liveLeads } = useLeadsRaw({ refetchInterval: opts?.refetchInterval ?? false });
  const { data: stages } = usePipelineStagesRaw();
  const leads = opts?.overrideLeads ?? liveLeads;
  return useMemo(() => {
    const stagesById = byId(stages);
    const map = new Map<string, ManagerFunnelStats>();
    for (const l of leads ?? []) {
      if (!l.owner_id) continue;
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      const cur = map.get(l.owner_id) ?? { totalLeads: 0, salesCount: 0, salesRevenue: 0 };
      cur.totalLeads += 1;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const stageName = stage ? normalizeStageName(stage.name) : "";
      if (SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        cur.salesCount += 1;
        cur.salesRevenue += l.expected_revenue;
      }
      map.set(l.owner_id, cur);
    }
    return map;
  }, [leads, stages, funnel]);
}

/* ------------------------------------------------------------------ */
/* Daily per-manager trend (Reyting charts) — conversion% and sales-     */
/* stage revenue, bucketed by day of lead creation, for every manager    */
/* with at least one lead in the funnel. "Conversion" here is each       */
/* day's cohort of created leads that are *currently* sitting in a       */
/* sales stage — there's no stored historical snapshot of conversion     */
/* itself to chart directly, so this is the closest real approximation.  */
/* ------------------------------------------------------------------ */

const DEFAULT_TREND_DAYS = 30;
// A "Butun davr" (all-time) range with years of history would otherwise
// bucket into hundreds of illegible daily points -- cap it the same way
// the chart itself is already capped for legibility.
const MAX_TREND_DAYS = 90;

export type ManagerTrendSeries = {
  id: string;
  name: string;
  conversion: (number | null)[];
  salesRevenue: number[];
};

export type ManagerDailyTrend = { dayLabels: string[]; series: ManagerTrendSeries[] };

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function useManagerDailyTrend(
  funnel?: string | null,
  from?: Date | null,
  to?: Date | null,
): ManagerDailyTrend {
  const { data: leads } = useLeadsRaw();
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const managerStats = useManagerFunnelStats(funnel);

  return useMemo(() => {
    const rangeEnd = startOfDay(to ?? new Date());
    const rangeStart = from
      ? startOfDay(from)
      : new Date(rangeEnd.getTime() - (DEFAULT_TREND_DAYS - 1) * 86400000);
    const dayCount = Math.min(
      MAX_TREND_DAYS,
      Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1),
    );

    const dayStarts: Date[] = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(rangeEnd);
      d.setDate(d.getDate() - i);
      dayStarts.push(d);
    }
    const dayLabels = dayStarts.map((d) => `${d.getDate()}.${d.getMonth() + 1}`);

    const ownerIds = Array.from(managerStats.entries())
      .sort((a, b) => b[1].salesRevenue - a[1].salesRevenue)
      .map(([id]) => id);
    if (ownerIds.length === 0) return { dayLabels, series: [] };

    const profilesById = byId(profiles);
    const stagesById = byId(stages);

    type Bucket = { total: number; sales: number; salesRevenue: number };
    const buckets = new Map<string, Bucket[]>();
    for (const id of ownerIds) {
      buckets.set(
        id,
        dayStarts.map(() => ({ total: 0, sales: 0, salesRevenue: 0 })),
      );
    }

    for (const l of leads ?? []) {
      if (!l.owner_id || !buckets.has(l.owner_id)) continue;
      const leadFunnel = l.funnel || "Direct Sales";
      if (funnel && leadFunnel !== funnel) continue;
      const created = new Date(l.created_at);
      let dayIndex = -1;
      for (let i = dayStarts.length - 1; i >= 0; i--) {
        if (created >= dayStarts[i]!) {
          dayIndex = i;
          break;
        }
      }
      if (dayIndex === -1) continue;
      const bucket = buckets.get(l.owner_id)![dayIndex]!;
      bucket.total += 1;
      const stage = l.stage_id ? stagesById.get(l.stage_id) : undefined;
      const stageName = stage ? normalizeStageName(stage.name) : "";
      if (SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw))) {
        bucket.sales += 1;
        bucket.salesRevenue += l.expected_revenue;
      }
    }

    const series: ManagerTrendSeries[] = ownerIds.map((id) => {
      const b = buckets.get(id)!;
      return {
        id,
        name: profileName(profilesById.get(id)),
        conversion: b.map((w) => (w.total ? (w.sales / w.total) * 100 : null)),
        salesRevenue: b.map((w) => w.salesRevenue),
      };
    });

    return { dayLabels, series };
  }, [leads, stages, profiles, managerStats, funnel, from, to]);
}

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
