// Contracts, qualification and call-scoring rubric, daily report settings.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { apiFetch } from "@/lib/api";
import { type ManagerReportData } from "@/lib/manager-report";
import { useAuth } from "@/lib/auth";
import {
  RESOURCE_PAGE_SIZE,
  amocrmCallsResource,
  callCategoriesResource,
  callLogsResource,
  callSkillsResource,
  callStageStepsResource,
  callStagesResource,
  contractTemplatesResource,
  fetchAllPages,
  intakeQuestionsResource,
  leadActivitiesResource,
  leadQualityStagesResource,
  miniAppAudioRulesResource,
  notificationsResource,
  pbxCallsResource,
  pipelinesResource,
  profilesResource,
  qualificationCriteriaResource,
  qualificationGroupsResource,
  reportStageTransitionRulesResource,
  rolePermissionsResource,
  serviceLinesResource,
  settingListsResource,
  stageRulesResource,
  stagesResource,
  workSessionsResource,
} from "./core";
import type {
  AmoCrmCallRow,
  DailyReportSettingsRow,
  LeadActivityRow,
  NotificationRow,
  Tables,
  TaskCommentRow,
} from "./core";

/* ------------------------------------------------------------------ */
/* Contract generation + simple e-signature (recommendation #4). See    */
/* the 20261005000000 migration + src/lib/contracts.ts (merge logic)    */
/* for the full picture -- a "simple" e-signature (typed name + IP +    */
/* timestamp), not a qualified/PKI digital signature.                   */
/* ------------------------------------------------------------------ */
export type ContractTemplateRow = Tables["contract_templates"]["Row"];

export const useContractTemplatesRaw = (
  opts?: Parameters<typeof contractTemplatesResource.useList>[0],
) => contractTemplatesResource.useList({ orderBy: "name", ascending: true, ...opts });

export const useCreateContractTemplate = contractTemplatesResource.useCreate;

export const useUpdateContractTemplate = contractTemplatesResource.useUpdate;

export const useDeleteContractTemplate = contractTemplatesResource.useRemove;

export type LeadContractRow = Tables["lead_contracts"]["Row"];

export function useLeadContracts(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead_contracts", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadContractRow[]> => {
      const { data, error } = await supabase
        .from("lead_contracts")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateLeadContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      leadId: string;
      templateId: string | null;
      title: string;
      body: string;
      createdBy: string;
    }): Promise<LeadContractRow> => {
      const { data, error } = await supabase
        .from("lead_contracts")
        .insert({
          organization_id: input.organizationId,
          lead_id: input.leadId,
          template_id: input.templateId,
          title: input.title,
          body: input.body,
          sign_token: crypto.randomUUID().replace(/-/g, ""),
          created_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => void qc.invalidateQueries({ queryKey: ["lead_contracts", data.lead_id] }),
  });
}

export function useMarkContractSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId: string }) => {
      const { error } = await supabase
        .from("lead_contracts")
        .update({ status: "sent" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { leadId }) =>
      void qc.invalidateQueries({ queryKey: ["lead_contracts", leadId] }),
  });
}

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

// The platform's own CRM vs. data synced from amoCRM / Bitrix24. Synced
// leads, stages and funnels live in the same tables because analytics
// (Reyting, Lead analytics, Dashboard...) read them, but the CRM section
// (Voronkalar, leads, contacts, its settings) shows only its own.
export const isNativeStage = (s: {
  amocrm_pipeline_id: number | null;
  bitrix24_category_id: number | null;
}) => s.amocrm_pipeline_id == null && s.bitrix24_category_id == null;

/** The CRM's own stages (none synced from amoCRM or Bitrix24). */
export function useCrmStages() {
  const q = usePipelineStagesRaw();
  const data = useMemo(() => q.data?.filter(isNativeStage), [q.data]);
  return { ...q, data };
}

/** The CRM's own funnels: its pipelines and its stages' funnel names. */
export function useCrmFunnelNames() {
  const stages = useCrmStages();
  const pipelines = usePipelines();
  const names = useMemo(() => {
    const set = new Set<string>();
    for (const p of pipelines.data ?? []) set.add(p.name);
    for (const st of stages.data ?? []) set.add(st.pipeline_name || "Direct Sales");
    return [...set].sort();
  }, [stages.data, pipelines.data]);
  return { names, isLoading: stages.isLoading || pipelines.isLoading };
}

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
      /** Managers the task rule applies to; empty = everyone. */
      taskProfiles?: string[];
      /** Managers the note rule applies to; empty = everyone. */
      noteProfiles?: string[];
    }): Promise<void> => {
      const { error } = await supabase.from("pipeline_stage_rules").upsert(
        {
          stage_id: input.stageId,
          requires_note: input.requiresNote,
          requires_task: input.requiresTask,
          ...(input.taskProfiles ? { task_profiles: input.taskProfiles } : {}),
          ...(input.noteProfiles ? { note_profiles: input.noteProfiles } : {}),
        } as never,
        { onConflict: "stage_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pipeline_stage_rules"] }),
  });
}

/**
 * "Zapret zadacha": whether moving a lead into a stage needs an open task
 * from the current user (the stage's rule is on, and names them or nobody).
 * The database enforces the same rule; this lets the UI ask first.
 */
export function useStageTaskRule() {
  return useStageRuleCheck("task");
}

/** Same for "Izoh majburiy": a fresh note before the lead moves into the stage. */
export function useStageNoteRule() {
  return useStageRuleCheck("note");
}

function useStageRuleCheck(kind: "task" | "note") {
  const { user } = useAuth();
  const { data: rules } = useStageRules();
  return useCallback(
    (stageId: string | null | undefined): boolean => {
      if (!stageId || !user?.id) return false;
      const rule = (rules ?? []).find((r) => r.stage_id === stageId);
      if (!(kind === "task" ? rule?.requires_task : rule?.requires_note)) return false;
      const only = (kind === "task" ? rule?.task_profiles : rule?.note_profiles) ?? [];
      return only.length === 0 || only.includes(user.id);
    },
    [rules, user?.id, kind],
  );
}

/** The note rule's verdict from the database: the stage's name when blocked. */
export async function fetchLeadNoteBlock(leadId: string, stageId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("lead_note_block", {
    p_lead: leadId,
    p_stage: stageId,
  });
  if (error) return null; // migration not applied yet -- nothing is enforced either
  return data ?? null;
}

/**
 * For a bulk move: the leads the stage's task/note rules would hold back.
 * Null when the database can't answer (migration not applied yet).
 */
export async function fetchLeadsBlockedForStage(
  ids: string[],
  stageId: string,
): Promise<Set<string> | null> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase.rpc("leads_blocked_for_stage", {
      p_ids: ids.slice(i, i + 300),
      p_stage: stageId,
    });
    if (error) return null;
    for (const r of data ?? []) out.add(r.lead_id);
  }
  return out;
}

/** Open (not Done) tasks on a lead, by anyone -- what the task rule counts. */
export function useLeadOpenTaskCount(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ["tasks", "lead", leadId, "open-count"],
    enabled: !!leadId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId!)
        .neq("status", "Done");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Which of these leads have at least one open task. */
export async function leadsWithOpenTasks(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase
      .from("tasks")
      .select("lead_id")
      .in("lead_id", ids.slice(i, i + 300))
      .neq("status", "Done");
    if (error) throw error;
    for (const r of data ?? []) if (r.lead_id) out.add(r.lead_id);
  }
  return out;
}

/** The task rule's verdict from the database: the stage's name when blocked. */
export type StageTaskViolation =
  Database["public"]["Functions"]["stage_task_violations"]["Returns"][number];

/**
 * Leads sitting in a task-required stage with no open task (their task was
 * closed, or an automation moved them). Null until
 * 20261108000000_task_control_auto_merge.sql runs.
 */
export function useStageTaskViolations(enabled = true) {
  return useQuery({
    queryKey: ["stage_task_violations"],
    enabled,
    queryFn: async (): Promise<StageTaskViolation[] | null> => {
      const { data, error } = await supabase.rpc("stage_task_violations");
      if (error) return null;
      return data ?? [];
    },
  });
}

export async function fetchLeadTaskBlock(leadId: string, stageId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("lead_task_block", {
    p_lead: leadId,
    p_stage: stageId,
  });
  if (error) return null; // migration not applied yet -- nothing is enforced either
  return data ?? null;
}

export type FunnelDuplicate = {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  stage_name: string | null;
  created_at: string;
};

/** This client's existing lead in the funnel (one client = one lead per funnel). */
export async function fetchFunnelDuplicate(
  funnel: string,
  phone: string,
  email?: string | null,
): Promise<FunnelDuplicate | null> {
  if (!phone.trim() && !email?.trim()) return null;
  const { data, error } = await supabase.rpc("find_funnel_duplicate", {
    p_funnel: funnel,
    p_phone: phone,
    p_email: email ?? null,
  });
  if (error) return null;
  return data?.[0] ?? null;
}

export type FunnelDuplicateGroup = {
  funnel: string;
  phone: string;
  lead_ids: string[];
  names: string[];
  owner_names: string[];
  created_ats: string[];
};

/** One client's several leads inside one funnel, for the admin merge page. */
export function useFunnelDuplicateGroups(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["funnel_duplicate_groups", user?.organizationId],
    enabled: enabled && !!user?.organizationId,
    queryFn: async (): Promise<FunnelDuplicateGroup[]> => {
      const { data, error } = await supabase.rpc("funnel_duplicate_groups");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMergeFunnelDuplicates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      groups: string[][],
    ): Promise<{ groups: number; merged: number; errors: string[] }> => {
      const res = await apiFetch("/leads/duplicates/funnel-merge", {
        method: "POST",
        body: JSON.stringify({ groups }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not merge leads.");
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["funnel_duplicate_groups"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

/** Today's numbers for the signed-in manager's end-of-day report in a funnel. */
export function useMyDailyReport(funnel: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_daily_report", user?.id, funnel],
    enabled: enabled && !!user?.id,
    staleTime: 0,
    queryFn: async (): Promise<ManagerReportData | null> => {
      const { data, error } = await supabase.rpc("my_daily_report", { p_funnel: funnel });
      if (error) throw error;
      return (data as unknown as ManagerReportData | null) ?? null;
    },
  });
}

/** Which bound Telegram chat daily reports are posted to (null = none picked). */
export function useSetManagerReportChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: number | null): Promise<void> => {
      const { error } = await supabase.rpc("set_manager_report_chat", { p_chat_id: chatId });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org_general_settings"] }),
  });
}

/** Posts a daily report into the company's report group through the bot. */
export function useSendReportToTelegram() {
  return useMutation({
    mutationFn: async (text: string): Promise<{ chat: string | null }> => {
      const res = await apiFetch("/reports/send-telegram", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Telegram'ga yuborib bo'lmadi.");
      return json;
    },
  });
}

/** Saves the report's working hours: work day end and auto-close ("HH:MM"). */
export function useSetManagerReportHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workDayEnd: string; autoClose: string }): Promise<void> => {
      const { error } = await supabase.rpc("set_manager_report_hours", {
        p_work_day_end: input.workDayEnd,
        p_auto_close: input.autoClose,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my_daily_report"] }),
  });
}

/** Saves the company's report template (super admin / ROP); null = the built-in one. */
export function useSetManagerReportTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: string | null): Promise<void> => {
      const { error } = await supabase.rpc("set_manager_report_template", {
        p_template: template,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my_daily_report"] }),
  });
}

export const useWorkSessionsRaw = (opts?: Parameters<typeof workSessionsResource.useList>[0]) =>
  workSessionsResource.useList({ orderBy: "clock_in", ascending: false, ...opts });

export const useCreateWorkSession = workSessionsResource.useCreate;

export const useUpdateWorkSession = workSessionsResource.useUpdate;

export const useCallLogsRaw = (opts?: Parameters<typeof callLogsResource.useList>[0]) =>
  callLogsResource.useList({ orderBy: "created_at", ascending: false, ...opts });

export const useCreateCallLog = callLogsResource.useCreate;

// Every call in the org, WITHOUT transcript / analysis / intake answers:
// dashboards and reports only count and group calls, and those three columns
// are most of each row's size (a long transcript plus the full AI analysis
// JSON), so downloading them for the whole call history made every
// dashboard open slow and ate the Supabase egress quota. Screens that show a
// call's analysis load it per lead (useLeadAmoCalls) or per date range
// (useAmoCrmCallsSince).
export type AmoCrmCallLite = Omit<
  AmoCrmCallRow,
  "transcript" | "analysis" | "intake_answers" | "analysis_error" | "analysis_attempts"
>;

const AMO_CALL_LITE_COLUMNS =
  "id, organization_id, lead_id, amocrm_lead_entity_id, amocrm_note_id, amocrm_task_id, " +
  "ai_note_id, ai_note_created_at, task_created_at, ai_summary, analyzed_at, connected, " +
  "created_by, direction, duration_seconds, mood, next_step, occurred_at, phone, " +
  "recording_url, score, service_line_id, source, synced_at, talk_ratio";

export function useAmoCrmCallsRaw(opts?: { enabled?: boolean }) {
  const q = amocrmCallsResource.useList({
    orderBy: "occurred_at",
    ascending: false,
    columns: AMO_CALL_LITE_COLUMNS,
    ...opts,
  });
  return q as Omit<typeof q, "data"> & { data: AmoCrmCallLite[] | undefined };
}

/** One lead's calls with their full analysis -- for the lead page. */
export function useLeadAmoCalls(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ["amocrm_calls", "lead", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<AmoCrmCallRow[]> => {
      const { data, error } = await supabase
        .from("amocrm_calls")
        .select("*")
        .eq("lead_id", leadId!)
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Org-wide, unlike usePbxCalls below (which is scoped to one lead/contact)
// -- needed so useAttendanceView can find each rep's own calls across every
// lead/contact they've called, the same way it already does for
// amocrm_calls.
export const usePbxCallsRaw = (opts?: Parameters<typeof pbxCallsResource.useList>[0]) =>
  pbxCallsResource.useList({ orderBy: "created_at", ascending: false, ...opts });

// Audio tahlil defaults to a bounded recent window (see audio-analytics.tsx)
// instead of unconditionally fetching this org's entire call history --
// amocrm_calls rows carry a transcript plus a full AI analysis JSON blob
// per call, so on an org with a long AmoCRM history every page open paid
// to download years of that. Widening the page's date filter re-runs this
// with a wider (or, for "All Time", unbounded) range instead of just
// re-filtering an already-fetched full table client-side.
export type AmoCallLeadRef = {
  id: string;
  name: string;
  company_name: string;
  owner_id: string | null;
  funnel: string | null;
  stage_id: string | null;
  tags: string[];
  amocrm_id: number | null;
};

export type AmoCrmCallWithLead = AmoCrmCallRow & { lead: AmoCallLeadRef | null };

export function useAmoCrmCallsSince(
  range: { from: Date | null; to: Date | null } | null,
  opts?: { enabled?: boolean },
) {
  const fromISO = range?.from ? range.from.toISOString() : null;
  const toISO = range?.to ? range.to.toISOString() : null;
  return useQuery({
    queryKey: ["amocrm_calls", "since", fromISO, toISO],
    enabled: opts?.enabled ?? true,
    queryFn: () =>
      fetchAllPages(async (from): Promise<AmoCrmCallWithLead[]> => {
        // Each call carries its lead's display fields, so the page doesn't
        // need the org's whole lead list to label them.
        let query = supabase
          .from("amocrm_calls")
          .select(
            "*, lead:leads(id, name, company_name, owner_id, funnel, stage_id, tags, amocrm_id)",
          );
        if (fromISO) query = query.gte("occurred_at", fromISO);
        if (toISO) query = query.lte("occurred_at", toISO);
        const { data, error } = await query
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as unknown as AmoCrmCallWithLead[];
      }),
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

// A lead note's own actions on the lead card: edit, delete (the author, an
// admin or a ROP -- RLS decides) and pin to the top of the feed (anyone in
// the company, through an RPC). An update/delete RLS refuses matches no row
// rather than erroring, so those ask for the row back and treat "none" as
// a refusal.
export function useEditLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; leadId: string; content: string }) => {
      const { data, error } = await supabase
        .from("lead_activities")
        .update({ content: input.content, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("not_allowed");
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ["lead_activities", v.leadId] }),
  });
}

export function useDeleteLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; leadId: string }) => {
      const { data, error } = await supabase
        .from("lead_activities")
        .delete()
        .eq("id", input.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("not_allowed");
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ["lead_activities", v.leadId] }),
  });
}

export function usePinLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; leadId: string; pinned: boolean }) => {
      const { error } = await supabase.rpc("set_lead_activity_pinned", {
        p_id: input.id,
        p_pinned: input.pinned,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ["lead_activities", v.leadId] }),
  });
}

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
