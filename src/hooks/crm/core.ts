// Shared plumbing: the generic per-table CRUD resource factory and the resources built on it.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { LeadFieldValue } from "./crm-views";

export type Tables = Database["public"]["Tables"];

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
export const RESOURCE_PAGE_SIZE = 1000;

// Large AmoCRM-synced accounts can have several thousand rows per table
// (leads/contacts/companies/pipeline_stages). Fetching pages one at a time,
// each awaited before the next request even starts, meant every CRM page
// load paid the full network round-trip cost of every page in sequence —
// the dominant cause of "still loading" for these accounts. Requesting a
// batch of pages concurrently (same pattern used for AmoCRM's own paginated
// fetches in client.server.ts) cuts that wall-clock time roughly by the
// batch size.
const LIST_PAGE_CONCURRENCY = 4;

/**
 * Every row of a paged query. Most tables fit in one page, so the first page
 * is fetched alone; only when it comes back full do the remaining pages go
 * out LIST_PAGE_CONCURRENCY at a time (instead of always firing four
 * requests, three of them empty).
 */
export async function fetchAllPages<Row>(
  fetchPage: (from: number) => Promise<Row[]>,
): Promise<Row[]> {
  const first = await fetchPage(0);
  if (first.length < RESOURCE_PAGE_SIZE) return first;
  const all: Row[] = [...first];
  let from = RESOURCE_PAGE_SIZE;
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
}

export function makeResource<TableName extends keyof Tables>(table: TableName, queryKey: QueryKey) {
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
    /** Comma-separated columns instead of "*", to leave out heavy ones. */
    columns?: string;
  }) {
    return useQuery({
      queryKey,
      enabled: config?.enabled ?? true,
      refetchInterval: config?.refetchInterval ?? false,
      queryFn: async (): Promise<Row[]> => {
        const fetchPage = async (from: number): Promise<Row[]> => {
          let query = supabase.from(table).select(config?.columns ?? "*");
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

        return fetchAllPages(fetchPage);
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

export const contractTemplatesResource = makeResource("contract_templates", ["contract_templates"]);

const companiesResource = makeResource("companies", ["companies"]);

const contactsResource = makeResource("contacts", ["contacts"]);

const leadsResource = makeResource("leads", ["leads"]);

const tasksResource = makeResource("tasks", ["tasks"]);

export const profilesResource = makeResource("profiles", ["profiles"]);

export const stagesResource = makeResource("pipeline_stages", ["pipeline_stages"]);

export const pipelinesResource = makeResource("pipelines", ["pipelines"]);

export const stageRulesResource = makeResource("pipeline_stage_rules", ["pipeline_stage_rules"]);

export const leadSourcesResource = makeResource("lead_sources", ["lead_sources"]);

export const leadFieldGroupsResource = makeResource("lead_field_groups", ["lead_field_groups"]);

export const leadCustomFieldDefsResource = makeResource("lead_custom_field_defs", [
  "lead_custom_field_defs",
]);

export const webFormsResource = makeResource("web_forms", ["web_forms"]);

export const notificationsResource = makeResource("notifications", ["notifications"]);

export const leadActivitiesResource = makeResource("lead_activities", ["lead_activities"]);

export const workSessionsResource = makeResource("work_sessions", ["work_sessions"]);

export const callLogsResource = makeResource("call_logs", ["call_logs"]);

export const amocrmCallsResource = makeResource("amocrm_calls", ["amocrm_calls"]);

export const pbxCallsResource = makeResource("pbx_calls", ["pbx_calls"]);

export const settingListsResource = makeResource("setting_lists", ["setting_lists"]);

export const rolePermissionsResource = makeResource("role_permissions", ["role_permissions"]);

export const qualificationGroupsResource = makeResource("call_qualification_groups", [
  "call_qualification_groups",
]);

export const qualificationCriteriaResource = makeResource("call_qualification_criteria", [
  "call_qualification_criteria",
]);

export const callCategoriesResource = makeResource("call_categories", ["call_categories"]);

export const callSkillsResource = makeResource("call_skills", ["call_skills"]);

export const callStagesResource = makeResource("call_stages", ["call_stages"]);

export const callStageStepsResource = makeResource("call_stage_steps", ["call_stage_steps"]);

export const serviceLinesResource = makeResource("service_lines", ["service_lines"]);

export const intakeQuestionsResource = makeResource("intake_questions", ["intake_questions"]);

export const reportStageTransitionRulesResource = makeResource(
  "daily_report_stage_transition_rules",
  ["daily_report_stage_transition_rules"],
);

export const miniAppAudioRulesResource = makeResource("daily_report_mini_app_audio_rules", [
  "daily_report_mini_app_audio_rules",
]);

export const leadQualityStagesResource = makeResource("lead_quality_stages", [
  "lead_quality_stages",
]);

export const automationRulesResource = makeResource("automation_rules", ["automation_rules"]);

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

// Lead lists leave out the two JSON columns (AI customer profile, custom
// field values): only the lead page shows them, and it loads its own lead
// in full (useLeadById). On an org with thousands of synced leads they were
// a large share of every dashboard / board download. Views built from these
// rows read them as empty.
export const LEAD_LIST_COLUMNS =
  "address, amocrm_id, bitrix24_deal_id, budget, campaign, city, company_id, company_name, " +
  "contact_id, country, created_at, expected_revenue, funnel, id, last_contact_at, " +
  "lead_quality_stage_id, loss_reason, manager_id, name, next_follow_up, organization_id, " +
  "owner_id, priority, recoverable, recoverable_reason, region, score, source, " +
  "stage_changed_at, stage_id, tags, temperature, updated_at, utm";

export const useLeadsRaw = (opts?: Parameters<typeof leadsResource.useList>[0]) =>
  leadsResource.useList({
    orderBy: "created_at",
    ascending: false,
    columns: LEAD_LIST_COLUMNS,
    ...opts,
  });

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
    // The funnel board shows the change at once (a card dropped on another
    // stage lands there immediately) and gets the saved row back instead of
    // refetching the whole funnel -- a refetch racing other queries made
    // cards jump back and forth. A refused change (task rule, RLS) is
    // rolled back.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["pipeline_board_leads"] });
      const snapshot = qc.getQueriesData<LeadRow[]>({ queryKey: ["pipeline_board_leads"] });
      qc.setQueriesData<LeadRow[]>({ queryKey: ["pipeline_board_leads"] }, (rows) =>
        rows?.map((r) => (r.id === id ? ({ ...r, ...patch } as LeadRow) : r)),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, rows] of ctx?.snapshot ?? []) qc.setQueryData(key, rows);
    },
    onSuccess: (row) => {
      qc.setQueriesData<LeadRow[]>({ queryKey: ["pipeline_board_leads"] }, (rows) =>
        rows?.map((r) => (r.id === row.id ? { ...r, ...row } : r)),
      );
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** Applies the same column patch (owner/stage/priority/etc.) to many leads at once. */
export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      patch,
    }: {
      ids: string[];
      patch: Database["public"]["Tables"]["leads"]["Update"];
    }): Promise<number> => {
      // A salesperson may only change their own leads; RLS skips the rest
      // silently, so count what was really updated.
      const { data, error } = await supabase.from("leads").update(patch).in("id", ids).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

/** Adds one tag to many leads at once, without duplicating it on rows that already have it. */
export function useBulkAddLeadTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, tag }: { ids: string[]; tag: string }): Promise<void> => {
      const { data: rows, error: readError } = await supabase
        .from("leads")
        .select("id, tags")
        .in("id", ids);
      if (readError) throw readError;
      for (const row of rows ?? []) {
        if ((row.tags ?? []).includes(tag)) continue;
        const { error } = await supabase
          .from("leads")
          .update({ tags: [...(row.tags ?? []), tag] })
          .eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

export function useBulkDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

/** amoCRM's "ред. теги": add some tags to and/or take some off many leads at once. */
export function useBulkEditLeadTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      add,
      remove,
    }: {
      ids: string[];
      add: string[];
      remove: string[];
    }): Promise<number> => {
      const { data: rows, error: readError } = await supabase
        .from("leads")
        .select("id, tags")
        .in("id", ids);
      if (readError) throw readError;
      let changed = 0;
      for (const row of rows ?? []) {
        const before = row.tags ?? [];
        const next = [...new Set([...before.filter((x) => !remove.includes(x)), ...add])];
        if (next.length === before.length && next.every((x) => before.includes(x))) {
          changed++;
          continue;
        }
        const { data, error } = await supabase
          .from("leads")
          .update({ tags: next })
          .eq("id", row.id)
          .select("id");
        if (error) throw error;
        if (data?.length) changed++;
      }
      return changed;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

/** amoCRM's "изм. поле" for an additional (custom) field: one value written into many leads. */
export function useBulkSetLeadCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      key,
      value,
    }: {
      ids: string[];
      key: string;
      value: LeadFieldValue;
    }): Promise<number> => {
      const { data: rows, error: readError } = await supabase
        .from("leads")
        .select("id, custom_fields")
        .in("id", ids);
      if (readError) throw readError;
      let changed = 0;
      for (const row of rows ?? []) {
        const current =
          row.custom_fields &&
          typeof row.custom_fields === "object" &&
          !Array.isArray(row.custom_fields)
            ? (row.custom_fields as Record<string, unknown>)
            : {};
        const next = { ...current };
        if (value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
        else next[key] = value;
        const { data, error } = await supabase
          .from("leads")
          .update({ custom_fields: next as Json })
          .eq("id", row.id)
          .select("id");
        if (error) throw error;
        if (data?.length) changed++;
      }
      return changed;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

/** amoCRM's "доб. задачу": the same task put on many leads in one insert. */
export function useBulkCreateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Tables["tasks"]["Insert"][]): Promise<number> => {
      const { data, error } = await supabase.from("tasks").insert(rows).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

export const useTasksRaw = (opts?: Parameters<typeof tasksResource.useList>[0]) =>
  tasksResource.useList({ orderBy: "due_date", ascending: true, ...opts });

export const useCreateTask = tasksResource.useCreate;

export const useUpdateTask = tasksResource.useUpdate;

export const useDeleteTask = tasksResource.useRemove;

// Deletes one lead from its card. Only super admins may (RLS, migration
// 20261022000000); a delete that matched no row means it was refused.
export function useDeleteLeadForever() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("leads").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("not_allowed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
    },
  });
}

// Deleting an open task from the lead card. RLS lets only its creator, an
// admin or a ROP delete; a refused delete matches no row instead of
// erroring, so ask for the row back and treat "none" as a refusal.
export function useDeleteLeadTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("not_allowed");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
