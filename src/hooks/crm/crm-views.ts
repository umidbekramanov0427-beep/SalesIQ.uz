// CRM views: lookup maps, composite loader, leads, pipeline board, funnels, leaderboard, audio analytics, companies, contacts, tasks.
// Split out of src/hooks/use-crm-data.ts, which re-exports everything here.
import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate, formatFollowUp, initialsOf, timeAgo } from "@/lib/utils";
import type { StoredCustomerProfile } from "@/lib/ai-customer-profile";
import { RESOURCE_PAGE_SIZE, fetchAllPages, selectLeadsWithStream, useLeadsRaw } from "./core";
import type {
  AmoCrmCallRow,
  ContactRow,
  LeadRow,
  ProfileRow,
  StageRow,
  Tables,
  TaskRow,
} from "./core";
import {
  useAmoCrmCallsSince,
  useCrmFunnelNames,
  usePipelineStagesRaw,
  useProfilesRaw,
} from "./config";
import type { AmoCallLeadRef, AmoCrmCallWithLead } from "./config";
import { scopeByLead, useLeadCube, useVisibleCube } from "./dashboard";
import { useLeadOwnerIds } from "./team";

/* ------------------------------------------------------------------ */
/* Lookup maps — small helpers shared by the view hooks below.         */
/* ------------------------------------------------------------------ */

export function byId<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows ?? []) m.set(r.id, r);
  return m;
}

export function profileName(p: ProfileRow | undefined): string {
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

/* ------------------------------------------------------------------ */
/* View: CRM Leads (register + detail page) — shaped like the former  */
/* CrmLead mock type so existing UI keeps working against real data.  */
/* ------------------------------------------------------------------ */

/** A custom field's stored value: text/date as a string, a flag, or a multi-select list. */
export type LeadFieldValue = string | boolean | string[];

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
  source: string;
  campaign: string;
  /** Patok: the intake/cohort, e.g. "14.1" ("" when unset or before its migration). */
  stream: string;
  utm: string;
  owner: string;
  ownerId: string;
  manager: string;
  managerId: string | null;
  contactId: string | null;
  // The linked contact's own name (an amoCRM deal is usually titled
  // "Сделка #123", with the person living on the contact) -- blank when
  // the hook didn't fetch contacts.
  contactName: string;
  priority: LeadRow["priority"];
  score: number;
  temperature: LeadRow["temperature"];
  /** Why the AI scored it so, one reason per line, and the next step (lead-scoring). */
  aiScoreReason?: string | null | undefined;
  aiNextAction?: string | null | undefined;
  aiScoredAt?: string | null | undefined;
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
  nextFollowUpIso: string | null;
  lastContact: string;
  // Raw timestamps behind lastContact / updated, for sorting.
  lastContactIso: string | null;
  created: string;
  createdAtIso: string;
  updated: string;
  updatedAtIso: string;
  tags: string[];
  amocrmId: number | null;
  aiCustomerProfile: StoredCustomerProfile | null;
  customFields: Record<string, LeadFieldValue>;
  /** Times this client registered again into the same funnel (merged into this lead). */
  repeatCount: number;
  /** The lead's short number (leads.lead_number), once the column exists. */
  leadNumber?: number | null;
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
    source: l.source ?? "",
    campaign: l.campaign ?? "",
    stream: l.stream ?? "",
    utm: l.utm ?? "",
    owner: owner ? profileName(owner) : "Unassigned",
    ownerId: l.owner_id ?? "",
    manager: manager ? profileName(manager) : "—",
    managerId: l.manager_id ?? null,
    contactId: l.contact_id ?? null,
    contactName: contact?.full_name ?? "",
    priority: l.priority,
    score: l.score,
    temperature: l.temperature,
    aiScoreReason: l.ai_score_reason ?? null,
    aiNextAction: l.ai_next_action ?? null,
    aiScoredAt: l.ai_scored_at ?? null,
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
    nextFollowUpIso: l.next_follow_up,
    lastContact: timeAgo(l.last_contact_at),
    lastContactIso: l.last_contact_at,
    created: formatDate(l.created_at),
    createdAtIso: l.created_at,
    updated: timeAgo(l.updated_at),
    updatedAtIso: l.updated_at,
    tags: l.tags ?? [],
    amocrmId: l.amocrm_id,
    aiCustomerProfile: (l.ai_customer_profile as StoredCustomerProfile | null) ?? null,
    customFields: (l.custom_fields as Record<string, LeadFieldValue> | null) ?? {},
    repeatCount: l.repeat_count ?? 0,
  };
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
      let q = supabase
        .from("leads")
        .select("*")
        // The CRM's own leads; amoCRM/Bitrix24's are for analytics only.
        .is("amocrm_id", null)
        .is("bitrix24_deal_id", null);
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
      "crm",
      user?.organizationId,
      search,
      params.stageId ?? null,
      ownerScopeKey,
    ],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<LeadsListStats> => {
      const args = { p_search: search, p_stage_id: params.stageId ?? null };
      let { data, error } = await supabase.rpc("crm_leads_list_stats", args).maybeSingle();
      // Before 20261029000000_crm_native_funnel_stats.sql is applied.
      if (error) ({ data, error } = await supabase.rpc("leads_list_stats", args).maybeSingle());
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

function usePipelineBoardLeadsRaw(funnel: string | null, refetchIntervalMs?: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pipeline_board_leads", user?.organizationId, funnel],
    enabled: !!user?.organizationId && !!funnel,
    // exactOptionalPropertyTypes rejects `refetchInterval: undefined`
    // outright (it wants the key omitted, not present-with-undefined) --
    // the ternary keeps the key out of the object entirely when unset
    // instead of failing every useQuery overload at once.
    ...(refetchIntervalMs !== undefined ? { refetchInterval: refetchIntervalMs } : {}),
    queryFn: async (): Promise<LeadRow[]> => {
      const fetchPage = async (from: number): Promise<LeadRow[]> => {
        const data = await selectLeadsWithStream((columns) =>
          supabase
            .from("leads")
            .select(columns)
            .eq("funnel", funnel!)
            // The CRM board: the platform's own leads, not amoCRM/Bitrix24's.
            .is("amocrm_id", null)
            .is("bitrix24_deal_id", null)
            .order("id", { ascending: true })
            .range(from, from + RESOURCE_PAGE_SIZE - 1),
        );
        return (data ?? []) as unknown as LeadRow[];
      };

      return fetchAllPages(fetchPage);
    },
  });
}

/**
 * Same shape as useCrmLeads, scoped to a single funnel and fetched
 * server-side -- see the comment above usePipelineBoardLeadsRaw for why.
 * refetchIntervalMs is opt-in (the Funnels page's own "Auto-refresh"
 * toggle) -- every other caller polls on-demand only, same as before.
 */
/** An open task with a due date on one of the funnel's leads. */
export type FunnelOpenTask = {
  id: string;
  lead_id: string | null;
  due_date: string | null;
  title: string;
  assignee_id: string | null;
};
const EMPTY_OPEN_TASKS: FunnelOpenTask[] = [];

export function usePipelineBoardLeads(funnel: string | null, refetchIntervalMs?: number) {
  const board = usePipelineBoardLeadsRaw(funnel, refetchIntervalMs);
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
        .select("id, full_name, phone, alt_phone, email, telegram, position")
        .in("id", contactIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const contactsById = useMemo(() => byId(contacts ?? []), [contacts]);

  // The card's task marker: each lead's earliest open task (the ones set
  // from the lead's own composer). Keyed under "tasks" so creating or
  // closing a task anywhere refreshes it.
  const leadIds = useMemo(() => scopedLeads.map((l) => l.id), [scopedLeads]);
  const { data: openTasks } = useQuery({
    queryKey: ["tasks", "pipeline_board", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const rows: FunnelOpenTask[] = [];
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data, error } = await supabase
          .from("tasks")
          .select("id, lead_id, due_date, title, assignee_id")
          .in("lead_id", leadIds.slice(i, i + 200))
          .neq("status", "Done")
          .not("due_date", "is", null);
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      return rows;
    },
  });
  // Every open task's due date per lead -- the funnel's "tasks today /
  // overdue" counts count tasks, not leads.
  const taskDues = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of openTasks ?? []) {
      if (!r.lead_id || !r.due_date) continue;
      const list = m.get(r.lead_id);
      if (list) list.push(r.due_date);
      else m.set(r.lead_id, [r.due_date]);
    }
    return m;
  }, [openTasks]);
  const taskDueByLead = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of openTasks ?? []) {
      if (!r.lead_id || !r.due_date) continue;
      const cur = m.get(r.lead_id);
      if (!cur || r.due_date < cur) m.set(r.lead_id, r.due_date);
    }
    return m;
  }, [openTasks]);

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
        position: contact?.position ?? "",
        phone: contact?.phone ?? "",
        altPhone: contact?.alt_phone ?? "",
        email: contact?.email ?? "",
        telegram: contact?.telegram ?? "",
        source: l.source ?? "",
        campaign: l.campaign ?? "",
        stream: l.stream ?? "",
        utm: l.utm ?? "",
        owner: owner ? profileName(owner) : "Unassigned",
        ownerId: l.owner_id ?? "",
        manager: manager ? profileName(manager) : "—",
        managerId: l.manager_id ?? null,
        contactId: l.contact_id ?? null,
        contactName: contact?.full_name ?? "",
        priority: l.priority,
        score: l.score,
        temperature: l.temperature,
        aiScoreReason: l.ai_score_reason ?? null,
        aiNextAction: l.ai_next_action ?? null,
        aiScoredAt: l.ai_scored_at ?? null,
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
        nextFollowUp: formatFollowUp(taskDueByLead.get(l.id) ?? l.next_follow_up),
        nextFollowUpIso: taskDueByLead.get(l.id) ?? l.next_follow_up,
        lastContact: timeAgo(l.last_contact_at),
        lastContactIso: l.last_contact_at,
        created: formatDate(l.created_at),
        createdAtIso: l.created_at,
        updated: timeAgo(l.updated_at),
        updatedAtIso: l.updated_at,
        tags: l.tags ?? [],
        amocrmId: l.amocrm_id,
        aiCustomerProfile: (l.ai_customer_profile as StoredCustomerProfile | null) ?? null,
        customFields: (l.custom_fields as Record<string, LeadFieldValue> | null) ?? {},
        repeatCount: l.repeat_count ?? 0,
      };
    });
  }, [scopedLeads, profiles, stages, contactsById, taskDueByLead]);

  return {
    rows,
    taskDues,
    openTasks: openTasks ?? EMPTY_OPEN_TASKS,
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
export function useFunnelScopedLeads(
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
  // Voronkalar is the CRM: its own funnels only, never amoCRM/Bitrix24's.
  const { names: crmFunnels } = useCrmFunnelNames();
  const query = useQuery({
    queryKey: ["funnel_list_stats", "crm", user?.organizationId],
    enabled: enabled && !!user?.organizationId,
    queryFn: async () => {
      const crm = await supabase.rpc("crm_funnel_list_stats");
      if (!crm.error) return { rows: crm.data ?? [], native: true };
      // Before 20261029000000_crm_native_funnel_stats.sql is applied.
      const { data, error } = await supabase.rpc("funnel_list_stats");
      if (error) throw error;
      return { rows: data ?? [], native: false };
    },
  });

  const funnels = useMemo<FunnelStat[]>(
    () =>
      (query.data?.rows ?? [])
        .filter((r) => query.data?.native || crmFunnels.includes(r.funnel))
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
    [query.data, crmFunnels],
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

export type LeaderboardStatsRow = {
  owner_id: string;
  total_leads: number;
  won_leads: number;
  lost_leads: number;
  revenue: number;
};

/**
 * Per-owner lead totals for Reyting (leaderboard_stats). Until that
 * function exists in the database, lead_stats_cube's per-owner/stage
 * groups are summed instead (no tag filter there).
 */
export async function fetchLeaderboardStats(f: {
  from: string | null;
  to: string | null;
  funnel: string | null;
  stageId: string | null;
  tags: string[];
}): Promise<LeaderboardStatsRow[]> {
  const { data, error } = await supabase.rpc("leaderboard_stats", {
    p_from: f.from,
    p_to: f.to,
    p_funnel: f.funnel,
    p_stage_id: f.stageId,
    p_tags: f.tags.length ? f.tags : null,
  });
  if (!error) return data ?? [];
  const [cube, stages] = await Promise.all([
    fetchAllPages(async (offset) => {
      const r = await supabase
        .rpc("lead_stats_cube", { p_funnel: f.funnel, p_from: f.from, p_to: f.to, p_grain: "none" })
        .order("owner_id")
        .order("funnel")
        .order("stage_id")
        .order("recoverable")
        .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
      if (r.error) throw r.error;
      return r.data ?? [];
    }),
    supabase.from("pipeline_stages").select("id, is_won, is_lost"),
  ]);
  if (stages.error) throw stages.error;
  const stageById = new Map((stages.data ?? []).map((st) => [st.id, st]));
  const byOwner = new Map<string, LeaderboardStatsRow>();
  for (const r of cube) {
    if (!r.owner_id || (f.stageId && r.stage_id !== f.stageId)) continue;
    const st = r.stage_id ? stageById.get(r.stage_id) : undefined;
    const row = byOwner.get(r.owner_id) ?? {
      owner_id: r.owner_id,
      total_leads: 0,
      won_leads: 0,
      lost_leads: 0,
      revenue: 0,
    };
    const n = Number(r.n);
    row.total_leads += n;
    if (st?.is_won) {
      row.won_leads += n;
      row.revenue += Number(r.revenue);
    }
    if (st?.is_lost) row.lost_leads += n;
    byOwner.set(r.owner_id, row);
  }
  return [...byOwner.values()];
}

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
  } = useProfilesRaw();
  const {
    data: stages,
    isLoading: stagesLoading,
    isFetching: stagesFetching,
    refetch: refetchStages,
  } = usePipelineStagesRaw();
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
    // Another funnel or period keeps the current ranking on screen until
    // the new one arrives, instead of flashing an empty table.
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchLeaderboardStats({
        from: filters.from,
        to: filters.to,
        funnel: filters.funnel,
        stageId: filters.stageId,
        tags: filters.tags,
      }),
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
} & Partial<CallDeepAnalysis>;

// "Chuqur tahlil" fields (see parseDeepAnalysis in audio-analytics.analyze.ts)
// -- spread into the same analysis jsonb, absent on older calls.
export type CallDeepAnalysis = {
  callOutcome: { label: string; tone: "positive" | "neutral" | "negative" } | null;
  outcomeAnalysis: {
    why: string;
    keyFactors: string[];
    recontact: { recommended: boolean; reason: string; when: string | null } | null;
  } | null;
  nextStepDetail: { action: string; reason: string; priority: "low" | "medium" | "high" } | null;
  dealProbability: { value: number; reason: string } | null;
  analysisConfidence: "low" | "medium" | "high" | null;
  qualification: {
    key: "budget" | "authority" | "need" | "timeline";
    question: string;
    status: "answered" | "partial" | "unanswered";
    answer: string;
    timestamp: string | null;
  }[];
  objectionHandling: {
    objection: string;
    managerResponse: string;
    handled: boolean;
    betterResponse: string;
    timestamp: string | null;
  }[];
  customerQuestions: { question: string; answered: boolean; timestamp: string | null }[];
  buyingSignals: { text: string; timestamp: string | null }[];
  painPoints: string[];
  competitors: string[];
  priceDiscussion: { discussed: boolean; details: string } | null;
  coachingTip: string | null;
  followUpMessage: string | null;
};

const ANALYSIS_ARRAY_KEYS = [
  "checklist",
  "strengths",
  "improvements",
  "warnings",
  "risks",
  "agreements",
  "keyQuotes",
  "topObjections",
  "serviceStandards",
] as const;
const ANALYSIS_OPTIONAL_ARRAY_KEYS = [
  "sentimentTimeline",
  "keyTopics",
  "qualification",
  "objectionHandling",
  "customerQuestions",
  "buyingSignals",
  "painPoints",
  "competitors",
] as const;

/**
 * A saved analysis as the UI can trust it: every list is a list. The AI
 * sometimes leaves a field out (or older rows predate it), and reading
 * `.length` of a missing list used to take the whole lead page down.
 */
export function normalizeCallAnalysis(raw: unknown): CallAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = { ...(raw as Record<string, unknown>) };
  for (const k of ANALYSIS_ARRAY_KEYS) if (!Array.isArray(a[k])) a[k] = [];
  for (const k of ANALYSIS_OPTIONAL_ARRAY_KEYS) if (a[k] != null && !Array.isArray(a[k])) a[k] = [];
  const oa = a["outcomeAnalysis"];
  if (oa && typeof oa === "object" && !Array.isArray((oa as { keyFactors?: unknown }).keyFactors)) {
    a["outcomeAnalysis"] = { ...(oa as object), keyFactors: [] };
  }
  return a as unknown as CallAnalysis;
}

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
  /** The AI has analyzed this call (its summary may still be loading). */
  analyzed: boolean;
  nextStep: string | null;
  amocrmTaskId: number | null;
  aiNoteId: number | null;
  amocrmId: number | null;
  score: number | null;
  mood: string | null;
  talkRatio: number | null;
  analysis: CallAnalysis | null;
  /** Why background analysis failed (only while the call is still unanalysed). */
  analysisError: string | null;
  createdBy: string | null;
  source: string;
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
  const { data: liveCalls } = useAmoCrmCallsSince(range, {
    enabled: !overrideCalls,
  });
  // Loading until the calls have actually arrived -- also while the query
  // still waits for the session after a refresh (isLoading is false then).
  const callsLoading = !overrideCalls && liveCalls === undefined;
  // The display fields of each call's lead come embedded in the calls
  // query -- only the leads that actually have calls in the period, not the
  // org's whole lead list.
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  const { data: stages, isLoading: stagesLoading } = usePipelineStagesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownersWithLeads = useLeadOwnerIds();
  const isLoading = callsLoading || profilesLoading || stagesLoading;

  const leads = useMemo<AudioLeadLite[]>(() => {
    const profilesById = byId(profiles);
    const stagesById = byId(stages);
    const callLeads = new Map<string, AmoCallLeadRef>();
    for (const c of overrideCalls ?? liveCalls ?? []) {
      const lead = "lead" in c ? (c as AmoCrmCallWithLead).lead : null;
      if (lead) callLeads.set(lead.id, lead);
    }
    const scoped = Array.from(callLeads.values()).filter(
      (l) => !visibleOwnerIds || (!!l.owner_id && visibleOwnerIds.has(l.owner_id)),
    );
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
  }, [overrideCalls, liveCalls, profiles, stages, visibleOwnerIds]);

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
          analyzed: !!c.analyzed_at || !!c.ai_summary,
          nextStep: c.next_step,
          amocrmTaskId: c.amocrm_task_id,
          aiNoteId: c.ai_note_id,
          amocrmId: lead?.amocrmId ?? null,
          score: c.score,
          mood: c.mood,
          talkRatio: c.talk_ratio,
          analysis: (c.analysis as CallAnalysis | null) ?? null,
          analysisError: c.analyzed_at ? null : (c.analysis_error ?? null),
          createdBy: c.created_by,
          source: c.source,
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
    const profilesById = byId(profiles);
    for (const ownerId of ownersWithLeads) {
      if (visibleOwnerIds && !visibleOwnerIds.has(ownerId)) continue;
      const owner = profilesById.get(ownerId);
      if (!owner || map.has(ownerId)) continue;
      map.set(ownerId, { name: profileName(owner), calls: 0, connected: 0, duration: 0 });
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
  }, [calls, leadsById, ownersWithLeads, profiles, visibleOwnerIds]);

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
  const { user } = useAuth();
  // Only what the alerts need: no transcripts, just the AI risks out of the
  // analysis, and each call's lead name / owner embedded.
  const { data: calls, isLoading: callsLoading } = useQuery({
    queryKey: ["amocrm_calls", "alerts", user?.organizationId, from.toISOString()],
    enabled: !!user?.organizationId,
    queryFn: () =>
      fetchAllPages(async (offset) => {
        const { data, error } = await supabase
          .from("amocrm_calls")
          .select(
            "id, lead_id, occurred_at, connected, recording_url, score, risks:analysis->risks, lead:leads(id, name, owner_id)",
          )
          .gte("occurred_at", from.toISOString())
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + RESOURCE_PAGE_SIZE - 1);
        if (error) throw error;
        return (data ?? []) as unknown as {
          id: string;
          lead_id: string | null;
          occurred_at: string;
          connected: boolean;
          recording_url: string | null;
          score: number | null;
          risks: string[] | null;
          lead: { id: string; name: string; owner_id: string | null } | null;
        }[];
      }),
  });
  const ownerIdsWithLeads = useLeadOwnerIds();
  const { data: profiles, isLoading: profilesLoading } = useProfilesRaw();
  const { data: states, isLoading: statesLoading } = useAlertStatesRaw();
  const isLoading = callsLoading || profilesLoading || statesLoading;

  const alerts = useMemo<AlertView[]>(() => {
    const profilesById = byId(profiles);
    const out: AlertView[] = [];

    // Faoliyatsiz menejer -- a rep who owns at least one lead (so they're an
    // active seller, not e.g. a brand-new hire with nothing assigned yet)
    // but made zero calls in the last 24 hours.
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const callsLast24hByOwner = new Set<string>();
    for (const c of calls ?? []) {
      if (new Date(c.occurred_at).getTime() < dayAgo) continue;
      if (c.lead?.owner_id) callsLast24hByOwner.add(c.lead.owner_id);
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
      const lead = c.lead;
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
      const risks = Array.isArray(c.risks) ? c.risks : null;
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
  }, [calls, ownerIdsWithLeads, profiles, states]);

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

export function useRecentAnalyzedCalls(funnel: string | null, limit = 5) {
  const { user } = useAuth();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = visibleOwnerIds ? Array.from(visibleOwnerIds).sort().join(",") : null;

  const query = useQuery({
    queryKey: ["recent-analyzed-calls", limit, funnel ?? null, ownerKey],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("amocrm_calls")
        .select(
          "id, lead_id, occurred_at, score, mood, next_step, lead:leads!inner(name, funnel, owner_id)",
        )
        .not("score", "is", null);
      q = scopeByLead(q, funnel, visibleOwnerIds);
      const { data, error } = await q.order("occurred_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<RecentAnalyzedCall[]>(
    () =>
      (query.data ?? []).map((c) => ({
        id: c.id,
        leadId: c.lead_id,
        leadName: c.lead?.name ?? "—",
        score: c.score!,
        mood: c.mood,
        nextStep: c.next_step,
        occurredAt: timeAgo(c.occurred_at),
      })),
    [query.data],
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
  birthday: string;
  tasks: number;
  createdAtRaw: string;
};

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

export function toTaskView(
  t: TaskRow,
  profilesById: Map<string, ProfileRow>,
  lead: { name: string; funnel: string | null } | undefined,
): TaskView {
  const assignee = t.assignee_id ? profilesById.get(t.assignee_id) : undefined;
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
}

export function useTasksView(range?: { from: Date | null; to: Date | null }) {
  const { user } = useAuth();
  const profiles = useProfilesRaw();
  const visibleOwnerIds = useVisibleOwnerIds();
  const ownerKey = visibleOwnerIds ? [...visibleOwnerIds].sort().join(",") : null;
  const fromIso = range?.from?.toISOString() ?? null;
  const toIso = range?.to?.toISOString() ?? null;
  // Open tasks only, soonest first, filtered and capped by the database:
  // the whole tasks table (with each task's lead) was 36 MB in the load
  // test. Each task carries its lead's name / funnel, so the org's lead
  // list isn't needed to label them.
  const tasks = useQuery({
    queryKey: ["tasks", "open_with_lead", user?.organizationId, fromIso, toIso, ownerKey],
    enabled: !!user?.organizationId,
    queryFn: async () => {
      let q = supabase.from("tasks").select("*, lead:leads(name, funnel)").neq("status", "Done");
      if (visibleOwnerIds) q = q.in("assignee_id", [...visibleOwnerIds]);
      // Tasks with no due date are always kept -- a date filter scopes
      // "what's due when", it doesn't hide undated items.
      if (fromIso && toIso)
        q = q.or(`due_date.is.null,and(due_date.gte.${fromIso},due_date.lte.${toIso})`);
      else if (fromIso) q = q.or(`due_date.is.null,due_date.gte.${fromIso}`);
      else if (toIso) q = q.or(`due_date.is.null,due_date.lte.${toIso}`);
      const { data, error } = await q
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(RESOURCE_PAGE_SIZE);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<TaskView[]>(() => {
    const profilesById = byId(profiles.data);
    return (tasks.data ?? []).map(({ lead, ...t }) =>
      toTaskView(t, profilesById, lead ?? undefined),
    );
  }, [tasks.data, profiles.data]);

  return {
    rows,
    isLoading: tasks.isLoading || profiles.isLoading,
    isError: tasks.isError || profiles.isError,
  };
}

/** A handful of leads by id (e.g. the ones a page lists), with owner / stage names. */
export function useLeadsByIds(ids: string[]) {
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const key = [...ids].sort().join(",");
  const query = useQuery({
    queryKey: ["leads", "by_ids", key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const data = await selectLeadsWithStream((columns) =>
        supabase.from("leads").select(columns).in("id", ids),
      );
      return (data ?? []) as unknown as LeadRow[];
    },
  });
  const rows = useMemo<CrmLeadView[]>(() => {
    const stagesById = byId(stages);
    const profilesById = byId(profiles);
    const byLeadId = new Map((query.data ?? []).map((l) => [l.id, l]));
    return ids
      .map((id) => byLeadId.get(id))
      .filter((l): l is LeadRow => !!l)
      .map((l) => leadRowToView(l, undefined, profilesById, stagesById));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the stable form of ids
  }, [query.data, stages, profiles, key]);
  return { rows, isLoading: query.isLoading && ids.length > 0 };
}

/** Lead counts per stage (scoped like everything else), from the grouped stats. */
export function useStageLeadCounts(): Map<string, number> {
  const cube = useVisibleCube(useLeadCube({}).data);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of cube) {
      if (r.stage_id) counts.set(r.stage_id, (counts.get(r.stage_id) ?? 0) + r.n);
    }
    return counts;
  }, [cube]);
}

/** Up to 20 leads matching a name / company search, for pickers. */
// The account panel's search: leads by their name or company, by their
// contact's name or phone, or by amoCRM ID -- the same owner scoping as
// every other lead list.
export function useGlobalLeadSearch(term: string, enabled = true) {
  const { user } = useAuth();
  const visibleOwnerIds = useVisibleOwnerIds();
  const q = term
    .trim()
    .replace(/[%,()]/g, " ")
    .trim();
  const digits = q.replace(/\D/g, "");
  return useQuery({
    queryKey: ["leads", "global_search", user?.organizationId, q],
    enabled: enabled && !!user?.organizationId && q.length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, full_name, phone")
        .or(
          digits.length >= 4
            ? `full_name.ilike.%${q}%,phone.ilike.%${digits}%`
            : `full_name.ilike.%${q}%`,
        )
        .limit(20);
      const contactIds = (contacts ?? []).map((c) => c.id);
      const ors = [`name.ilike.%${q}%`, `company_name.ilike.%${q}%`];
      if (contactIds.length) ors.push(`contact_id.in.(${contactIds.join(",")})`);
      if (/^\d{3,12}$/.test(q)) ors.push(`amocrm_id.eq.${q}`);
      let query = supabase
        .from("leads")
        .select("id, name, company_name, funnel, contact_id, owner_id")
        .or(ors.join(","));
      if (visibleOwnerIds) query = query.in("owner_id", [...visibleOwnerIds]);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      const byContact = new Map((contacts ?? []).map((c) => [c.id, c]));
      return (data ?? []).map((l) => ({
        ...l,
        contact: l.contact_id ? (byContact.get(l.contact_id) ?? null) : null,
      }));
    },
  });
}
