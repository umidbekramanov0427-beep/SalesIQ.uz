import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  KanbanSquare,
  List,
  Loader2,
  Percent,
  Plus,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
  FileText,
  Workflow,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  Pill,
  PageLoader,
} from "@/components/layout/Primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TagChip } from "@/components/crm/tag-editor";
import { LeadPhoneChip, TemperatureChip } from "@/components/crm/lead-badges";
import {
  EMPTY_LEAD_FILTERS,
  FunnelSearchFilter,
  filterLeads,
  type LeadFilterState,
  type LeadPreset,
  type LeadTaskFilter,
} from "@/components/crm/LeadFilterBar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KanbanToolbarMenu, type PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { LeadDistributeWindow } from "@/components/crm/LeadDistributeWindow";
import { SaveFiltersButton } from "@/components/filters/SaveFiltersButton";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { StageMessageWindow } from "@/components/crm/StageMessageWindow";
import { ManagerReportDialog } from "@/components/crm/ManagerReportDialog";
import { PipelineBoard } from "@/components/crm/PipelineBoard";
import { FunnelTasksBoard, bucketFunnelTasks, useNowTick } from "@/components/crm/FunnelTasksBoard";
import { FunnelBulkBar } from "@/components/crm/FunnelBulkBar";
import { NewFunnelLeadDialog } from "@/components/crm/NewFunnelLeadDialog";
import { LiveRegistrationsPopup } from "@/components/crm/LiveRegistrations";
import { useLiveRegistrations } from "@/hooks/use-automations";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useOrgAccess } from "@/lib/use-org-access";
import { cn } from "@/lib/utils";
import {
  useAmoCrmLink,
  useLeadOwnerChanges,
  useFunnelListStats,
  useLeadCustomFieldDefs,
  usePermission,
  usePipelineBoardLeads,
  useCrmStages,
  useProfilesRaw,
  normalizeStageName,
  SALES_STAGE_KEYWORDS,
  FULL_PAYMENT_STAGE_KEYWORDS,
  type CrmLeadView,
  type FunnelOpenTask,
  type FunnelStat,
} from "@/hooks/use-crm-data";
import { FitText } from "@/components/ui/fit-text";

const { search: _s, funnel: _fn, ...FUNNEL_FILTER_DEFAULTS } = EMPTY_LEAD_FILTERS;

// A search value as text: the router parses "14.1" or "2024" into numbers.
const textParam = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

// The board toolbar's icon-only buttons (the name shows on hover).
const ICON_BUTTON =
  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-accent";

export const Route = createFileRoute("/funnels")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    funnel?: string | undefined;
    owner?: string | undefined;
    stage?: string | undefined;
    tags?: string | undefined;
    sources?: string | undefined;
    campaigns?: string | undefined;
    streams?: string | undefined;
    q?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    view?: "kanban" | "list" | "tasks" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    label?: string | undefined;
    name?: string | undefined;
    preset?: string | undefined;
    tasks?: string | undefined;
    cf?: string | undefined;
  } => ({
    funnel: typeof search["funnel"] === "string" ? search["funnel"] : undefined,
    owner: typeof search["owner"] === "string" ? search["owner"] : undefined,
    stage: typeof search["stage"] === "string" ? search["stage"] : undefined,
    tags: typeof search["tags"] === "string" ? search["tags"] : undefined,
    sources: typeof search["sources"] === "string" ? search["sources"] : undefined,
    campaigns: textParam(search["campaigns"]),
    // A Patok like 14.1 reads back from the URL as a number.
    streams: textParam(search["streams"]),
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    min: typeof search["min"] === "string" ? search["min"] : undefined,
    max: typeof search["max"] === "string" ? search["max"] : undefined,
    view:
      search["view"] === "kanban" || search["view"] === "list" || search["view"] === "tasks"
        ? search["view"]
        : undefined,
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    to: typeof search["to"] === "string" ? search["to"] : undefined,
    label: typeof search["label"] === "string" ? search["label"] : undefined,
    name: typeof search["name"] === "string" ? search["name"] : undefined,
    preset: typeof search["preset"] === "string" ? search["preset"] : undefined,
    tasks: typeof search["tasks"] === "string" ? search["tasks"] : undefined,
    cf: typeof search["cf"] === "string" ? search["cf"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Funnels — SalesIQ" },
      {
        name: "description",
        content: "Every sales funnel in the CRM, with a dedicated stage-by-stage analysis view.",
      },
      { property: "og:title", content: "Funnels — SalesIQ" },
      {
        property: "og:description",
        content: "Pipeline visualization and stage conversion analysis, per funnel.",
      },
    ],
  }),
  component: Funnels,
});

function Funnels() {
  const { funnel: funnelParam } = Route.useSearch();
  // The kanban toolbar's "Avtomatik yangilash" toggle -- lives here (not
  // inside FunnelDetail/PipelineBoard) since it has to reach into this
  // component's own usePipelineBoardLeads call to actually set the
  // query's refetchInterval; passed down as a plain on/off prop from here.
  const [autoRefresh, setAutoRefresh] = useState(false);

  // The list gets its per-funnel numbers from a single small SQL aggregate
  // instead of the whole org's leads; the detail view fetches only that
  // one funnel's leads (same hook the AmoCRM board uses).
  const listStats = useFunnelListStats(true);
  const board = usePipelineBoardLeads(
    funnelParam ? funnelParam : null,
    autoRefresh ? 15000 : undefined,
  );

  const funnels = listStats.funnels;
  const detailLeads = board.rows;
  const isLoading = funnelParam ? board.isLoading : listStats.isLoading;

  if (isLoading && funnels.length === 0 && !funnelParam) {
    return <PageLoader />;
  }

  return funnelParam ? (
    <FunnelDetail
      name={funnelParam}
      leads={detailLeads}
      taskDues={board.taskDues}
      openTasks={board.openTasks}
      isLoading={isLoading}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
    />
  ) : (
    <FunnelList funnels={funnels} isLoading={isLoading} />
  );
}

function HeatBar({ hot, warm, cold }: { hot: number; warm: number; cold: number }) {
  const { t } = useI18n();
  const total = Math.max(1, hot + warm + cold);

  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
        {t("funnels.heat")}
      </p>
      <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {hot > 0 && (
          <div className="h-full bg-rose-500" style={{ width: `${(hot / total) * 100}%` }} />
        )}
        {warm > 0 && (
          <div className="h-full bg-amber-500" style={{ width: `${(warm / total) * 100}%` }} />
        )}
        {cold > 0 && (
          <div className="h-full bg-sky-500" style={{ width: `${(cold / total) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

function FunnelList({ funnels, isLoading }: { funnels: FunnelStat[]; isLoading: boolean }) {
  const { t } = useI18n();
  const { format } = useCurrency();

  return (
    <>
      <PageHeader
        icon={Workflow}
        tone="violet"
        title={t("funnels.title")}
        description={t("funnels.navigatorDesc")}
      />

      {isLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {funnels.map((f) => (
          <Link
            key={f.name}
            to="/funnels"
            search={{ funnel: f.name }}
            className="surface-card group relative block overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated"
          >
            <div className="flex items-center justify-between gap-2">
              {/* This list is the CRM's own funnels only (useFunnelListStats);
                  amoCRM pipelines live in the analytics pages. */}
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                <Workflow className="h-3 w-3" /> CRM
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="min-w-0 truncate text-base font-bold text-foreground">{f.name}</p>
              <div className="min-w-0 max-w-[50%] shrink-0 text-right">
                <p className="text-2xl font-extrabold leading-none text-foreground">
                  <FitText>{f.count}</FitText>
                </p>
                <p className="mt-1 text-[11px] text-subtle">{t("dash.hero.leads")}</p>
              </div>
            </div>

            <HeatBar hot={f.hot} warm={f.warm} cold={f.cold} />

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="font-semibold text-foreground">{format(f.value)}</span>
              <span className="font-semibold text-success">
                {f.conversion}% {t("funnels.conversion")}
              </span>
            </div>
          </Link>
        ))}

        {funnels.length === 0 && !isLoading && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {t("funnels.noLeads")}
          </p>
        )}
      </div>
    </>
  );
}

// Column order is deliberately most- to least-important, left to right:
// who the lead is, where it sits in the pipeline, its tags, who owns it,
// how much it's worth, whether it's still open, then the AmoCRM deep link.
function LeadListHeader({
  selection,
}: {
  // Bulk mode: a "select all" box in front of the columns.
  selection?: { all: boolean; some: boolean; onToggleAll: () => void };
}) {
  const { t } = useI18n();
  return (
    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
      {selection && (
        <th className="w-10 px-3 py-2">
          <input
            type="checkbox"
            aria-label={t("bulk.selectAll")}
            checked={selection.all}
            ref={(el) => {
              if (el) el.indeterminate = !selection.all && selection.some;
            }}
            onChange={selection.onToggleAll}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
        </th>
      )}
      <th className="px-3 py-2 font-medium">{t("funnels.colName")}</th>
      <th className="px-3 py-2 font-medium">{t("funnels.colStage")}</th>
      <th className="px-3 py-2 font-medium">{t("funnels.colTags")}</th>
      <th className="px-3 py-2 font-medium">{t("funnels.colOwner")}</th>
      <th className="px-3 py-2 text-right font-medium">{t("funnels.colAmount")}</th>
      <th className="px-3 py-2 font-medium">{t("funnels.colStatus")}</th>
      <th className="px-3 py-2 text-right font-medium">{t("funnels.colAction")}</th>
    </tr>
  );
}

function LeadListRow({
  lead,
  getAmoLink,
  selection,
}: {
  lead: CrmLeadView;
  getAmoLink: (id: number | null) => string | null;
  selection?: { checked: boolean; onToggle: () => void };
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const amoLink = getAmoLink(lead.amocrmId);
  const status = lead.stageIsWon
    ? { tone: "success" as const, label: t("funnels.statusWon") }
    : lead.stageIsLost
      ? { tone: "danger" as const, label: t("funnels.statusLost") }
      : { tone: "info" as const, label: t("funnels.statusOpen") };

  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors last:border-0 hover:bg-accent",
        selection?.checked && "bg-primary/[0.06]",
      )}
    >
      {selection && (
        <td className="w-10 px-3 py-3">
          <input
            type="checkbox"
            checked={selection.checked}
            onChange={selection.onToggle}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
        </td>
      )}
      <td className="max-w-[16rem] px-3 py-3">
        <Link
          to="/crm/leads/$leadId"
          params={{ leadId: lead.id }}
          search={{ from: "funnels" }}
          className="block min-w-0"
        >
          <p className="truncate text-sm font-semibold text-foreground hover:text-primary">
            {lead.company || lead.name}
          </p>
          {lead.company && <p className="truncate text-xs text-subtle">{lead.name}</p>}
        </Link>
      </td>
      <td className="px-3 py-3">
        <Pill tone="neutral">{lead.stage}</Pill>
      </td>
      <td className="max-w-[12rem] px-3 py-3">
        {lead.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {lead.tags.slice(0, 3).map((tag) => (
              <TagChip key={tag} tag={tag} size="xs" />
            ))}
          </div>
        ) : (
          <span className="text-xs text-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-foreground">{lead.owner}</td>
      <td className="px-3 py-3 text-right text-sm font-semibold text-foreground">
        {format(lead.expectedRevenue)}
      </td>
      <td className="px-3 py-3">
        <Pill tone={status.tone}>{status.label}</Pill>
      </td>
      <td className="px-3 py-3 text-right">
        {amoLink && (
          <a
            href={amoLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-foreground/90 px-1.5 py-0.5 text-[10px] font-bold text-background hover:opacity-80"
          >
            {t("leadFilter.openInAmoCrm")} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </td>
    </tr>
  );
}

// One number in the funnel's analytics dialog: an icon chip in the
// metric's colour, the value large, a progress bar for percentages.
const METRIC_TONE = {
  primary: { chip: "bg-primary/12 text-primary", bar: "bg-primary" },
  success: { chip: "bg-success/12 text-success", bar: "bg-success" },
  danger: { chip: "bg-destructive/10 text-destructive", bar: "bg-destructive" },
  warning: {
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
} as const;

function DayStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[28px] font-extrabold leading-none tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}

function FunnelMetric({
  icon: Icon,
  label,
  value,
  hint,
  info,
  progress,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  info: string;
  progress?: number;
  tone: keyof typeof METRIC_TONE;
}) {
  const c = METRIC_TONE[tone];
  return (
    <div
      title={info}
      className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase leading-snug tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", c.chip)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <FitText className="mt-2 text-[26px] font-extrabold tabular-nums tracking-tight text-foreground">
        {value}
      </FitText>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", c.bar)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function FunnelDetail({
  name,
  leads,
  taskDues,
  openTasks,
  isLoading,
  autoRefresh,
  onAutoRefreshChange,
}: {
  name: string;
  leads: CrmLeadView[];
  taskDues: Map<string, string[]>;
  openTasks: FunnelOpenTask[];
  isLoading: boolean;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const canViewRevenue = usePermission("View revenue");
  const navigate = useNavigate();
  const search = Route.useSearch();
  // The AmoCRM board used to be its own permission-gated page ("View
  // pipeline") -- folded in here as a view mode, someone without that
  // permission just doesn't get the option and stays on the list.
  const canViewPipeline = usePermission("View pipeline");
  const { user } = useAuth();
  const hasAnalytics = useOrgAccess().has("analytics");

  // The 8 stat cards used to push the lead board down the page every time
  // they were expanded -- this is a CRM board people work in all day, so
  // the board itself now always stays put right under the filters, and the
  // numbers live behind an "Analitika" button that opens them in a dialog
  // instead of shifting the layout underneath.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Owned here (not inside PipelineBoard) so it survives the board's own
  // remounts and so the "..." toolbar that controls it can live in the
  // filter row instead of floating above the board -- see KanbanToolbarMenu.
  const [sortBy, setSortBy] = useState<PipelineSortBy>("created");
  // amoCRM's "Mass actions": ticks on board cards / list rows, and the bar under the header.
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  // The "..." menu's "Lid taqsimlash" and "Lidlarga xabar yuborish".
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [stageMessageOpen, setStageMessageOpen] = useState(false);
  const canManageLeads =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";

  // Clients registering through a salesbot into this funnel right now: a
  // pop-up follows their answers and their card is marked on the board.
  const qc = useQueryClient();
  const liveQuery = useLiveRegistrations();
  const live = useMemo(
    () => (liveQuery.data ?? []).filter((r) => (r.funnel || "Direct Sales") === name),
    [liveQuery.data, name],
  );
  const liveIds = useMemo(() => new Set(live.filter((r) => !r.done).map((r) => r.leadId)), [live]);
  // Each new client and each answer refreshes the board, so the card
  // appears at once and fills in as they go.
  const liveStamp = live.map((r) => `${r.runId}:${r.answered}:${r.done}`).join("|");
  useEffect(() => {
    if (liveStamp) void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
  }, [liveStamp, qc]);
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filters (and the board/list toggle) live in the URL, not local state,
  // so refresh/back-navigation returns you to exactly the same filtered
  // view of this funnel instead of resetting it.
  const filters: LeadFilterState = useMemo(() => {
    const list = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
    const custom: Record<string, string> = {};
    for (const pair of (search.cf ?? "").split(";")) {
      const i = pair.indexOf("=");
      if (i > 0)
        custom[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
    }
    return {
      funnel: name,
      ownerIds: list(search.owner),
      tags: list(search.tags),
      stageIds: list(search.stage),
      search: search.q ?? "",
      name: search.name ?? "",
      amount: {
        min: search.min !== undefined ? Number(search.min) : null,
        max: search.max !== undefined ? Number(search.max) : null,
      },
      sources: list(search.sources),
      campaigns: list(search.campaigns),
      streams: list(search.streams),
      preset: (search.preset ?? "") as LeadPreset,
      tasks: (search.tasks ?? "") as LeadTaskFilter,
      custom,
    };
  }, [
    name,
    search.owner,
    search.tags,
    search.stage,
    search.q,
    search.name,
    search.min,
    search.max,
    search.sources,
    search.campaigns,
    search.streams,
    search.preset,
    search.tasks,
    search.cf,
  ]);
  // Defaults to the AmoCRM board (the primary way to work a funnel day to
  // day) unless the role can't see it, in which case the list is the
  // fallback -- same as if they'd never had the "AmoCRM" option to pick.
  const requestedView: "kanban" | "list" | "tasks" =
    search.view === "list" ? "list" : search.view === "tasks" ? "tasks" : "kanban";
  const view = requestedView === "kanban" && !canViewPipeline ? "list" : requestedView;

  const dateFilter: DateFilterValue = useMemo(
    () => ({
      from: search.from ? new Date(search.from) : null,
      to: search.to ? new Date(search.to) : null,
      label: search.label ?? t("lb.presetAll"),
    }),
    [search.from, search.to, search.label, t],
  );
  function setDateFilter(v: DateFilterValue) {
    void navigate({
      to: "/funnels",
      search: (prev) => ({
        ...prev,
        from: v.from ? v.from.toISOString() : undefined,
        to: v.to ? v.to.toISOString() : undefined,
        label: v.label || undefined,
      }),
      replace: true,
    });
  }
  // Everything below (stat cards, owner/tag cascade, board/list) derives
  // from this date-scoped slice, not the raw `leads` prop directly.
  const dateScopedLeads = useMemo(() => {
    if (!dateFilter.from && !dateFilter.to) return leads;
    return leads.filter((l) => {
      const created = new Date(l.createdAtIso).getTime();
      if (dateFilter.from && created < dateFilter.from.getTime()) return false;
      if (dateFilter.to && created > dateFilter.to.getTime()) return false;
      return true;
    });
  }, [leads, dateFilter]);

  // "Saqlash": this funnel's panel filters (not the search box or dates)
  // open as saved next time -- per person, per funnel, in this browser.
  const { search: _q, funnel: _f, ...panelFilters } = filters;
  const funnelSaved = useSavedFilters(`funnel:${name}`, panelFilters, FUNNEL_FILTER_DEFAULTS, (v) =>
    updateFilters({ ...EMPTY_LEAD_FILTERS, ...v, funnel: name, search: filters.search }),
  );

  const { data: profiles } = useProfilesRaw();
  const { data: stages } = useCrmStages();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const funnelStages = useMemo(
    () => (stages ?? []).filter((s) => (s.pipeline_name || "Direct Sales") === name),
    [stages, name],
  );
  const getAmoLink = useAmoCrmLink();

  // Egalar/teglar filtrlari shu voronkadagi lidlarga tegishli bo'lishi
  // kerak -- butun akkaunt bo'yicha emas, aks holda boshqa voronkalarning
  // egalari/teglari ham ko'rinib, ishlatib bo'lmaydigan variantlar chiqadi.
  const funnelOwners = useMemo(() => {
    const ownerIds = new Set(dateScopedLeads.map((l) => l.ownerId).filter(Boolean));
    return (profiles ?? []).filter((p) => ownerIds.has(p.id));
  }, [dateScopedLeads, profiles]);
  const shownLeads = useMemo(
    () => filterLeads(dateScopedLeads, { ...filters, funnel: null }, user?.id ?? null),
    [dateScopedLeads, filters, user?.id],
  );

  // The 3 "late funnel" stages the user defined: prepayment ("Predoplata"/
  // "Peredoplata"), half payment ("Yarim to'lov"), and full payment/won
  // ("To'liq to'lov", "WON", "Успешно...", or "ROP Closed") -- the same
  // SALES_STAGE_KEYWORDS/FULL_PAYMENT_STAGE_KEYWORDS matching already used
  // for the daily report's sales-stage detection, reused here for
  // consistency instead of a second ad-hoc keyword list.
  //
  // Built from `shownLeads` (the fully filtered set: date + owner/stage/tag/
  // search/amount), not just `dateScopedLeads` -- these 8 cards used to
  // ignore every filter except the date range, so picking an owner/tag/
  // amount in the filter bar shrank the lead list below without changing a
  // single number above it.
  const stageMeta = useMemo(() => {
    let lateFunnelCount = 0;
    let lateFunnelRevenue = 0;
    let fullPaymentCount = 0;
    for (const l of shownLeads) {
      const stageName = normalizeStageName(l.stage);
      const isSalesStage =
        l.stageIsWon || SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
      const isFullPayment =
        l.stageIsWon || FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
      if (isSalesStage) {
        lateFunnelCount += 1;
        lateFunnelRevenue += l.expectedRevenue;
      }
      if (isFullPayment) fullPaymentCount += 1;
    }
    return { lateFunnelCount, lateFunnelRevenue, fullPaymentCount };
  }, [shownLeads]);

  const lateFunnelConversionRate = shownLeads.length
    ? Math.round((stageMeta.lateFunnelCount / shownLeads.length) * 1000) / 10
    : 0;
  const lostCount = shownLeads.filter((l) => l.stageIsLost).length;
  const avgLateFunnelDeal = stageMeta.lateFunnelCount
    ? stageMeta.lateFunnelRevenue / stageMeta.lateFunnelCount
    : 0;
  // Snapshot proxy, same reasoning as the daily report's biggestStageDrop --
  // there's no per-lead stage-visit history in this schema to replay a true
  // historical funnel, so "reached prepayment/half payment" is approximated
  // by each lead's *current* stage position (at or past that milestone).
  // Real current CRM data either way, just an approximation of "reached".
  const fullPaymentConversionRate = stageMeta.lateFunnelCount
    ? Math.round((stageMeta.fullPaymentCount / stageMeta.lateFunnelCount) * 1000) / 10
    : 0;

  // amoCRM's "Tasks for today / Without tasks / Overdue / New today /
  // yesterday" strip, over the same filtered leads as everything else.
  // Tasks are counted one by one (a lead can have several); "without
  // tasks" matches the card's own "No tasks" marker.
  const dayStats = useMemo(() => {
    const now = Date.now();
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    const today = d0.getTime();
    const tomorrow = today + 86_400_000;
    const yesterday = today - 86_400_000;
    let tasksToday = 0;
    let overdueTasks = 0;
    let noTasks = 0;
    let newToday = 0;
    let newYesterday = 0;
    for (const l of shownLeads) {
      for (const due of taskDues.get(l.id) ?? []) {
        const at = new Date(due).getTime();
        if (at < now) overdueTasks += 1;
        else if (at < tomorrow) tasksToday += 1;
      }
      if (!l.nextFollowUpIso) noTasks += 1;
      const created = new Date(l.createdAtIso).getTime();
      if (created >= today) newToday += 1;
      else if (created >= yesterday) newYesterday += 1;
    }
    return { tasksToday, overdueTasks, noTasks, newToday, newYesterday, today, tomorrow, now };
  }, [shownLeads, taskDues]);
  const todayIso = useMemo(() => new Date(dayStats.today).toISOString(), [dayStats.today]);
  const { data: ownerChanges = [] } = useLeadOwnerChanges(todayIso, analyticsOpen);
  // Per responsible person, today: leads that came in for them (created
  // today) and leads handed over to them today, plus where their tasks
  // stand -- the funnel as each salesperson sees it.
  const ownerToday = useMemo(() => {
    const inFunnel = new Map(shownLeads.map((l) => [l.id, l]));
    const rows = new Map<
      string,
      {
        id: string;
        name: string;
        created: number;
        handed: number;
        tasks: number;
        overdue: number;
        noTasks: number;
      }
    >();
    const row = (id: string, name: string) => {
      let r = rows.get(id);
      if (!r) {
        r = { id, name, created: 0, handed: 0, tasks: 0, overdue: 0, noTasks: 0 };
        rows.set(id, r);
      }
      return r;
    };
    for (const l of shownLeads) {
      if (!l.ownerId) continue;
      const r = row(l.ownerId, l.owner);
      if (new Date(l.createdAtIso).getTime() >= dayStats.today) r.created += 1;
      if (!l.nextFollowUpIso) r.noTasks += 1;
      for (const due of taskDues.get(l.id) ?? []) {
        const at = new Date(due).getTime();
        if (at < dayStats.now) r.overdue += 1;
        else if (at < dayStats.tomorrow) r.tasks += 1;
      }
    }
    const handedLeads = new Set<string>();
    for (const c of ownerChanges) {
      const lead = inFunnel.get(c.leadId);
      // Still theirs, and not already counted as created today.
      if (!lead || lead.ownerId !== c.ownerId) continue;
      if (new Date(lead.createdAtIso).getTime() >= dayStats.today) continue;
      if (handedLeads.has(c.leadId)) continue;
      handedLeads.add(c.leadId);
      row(c.ownerId, lead.owner).handed += 1;
    }
    return [...rows.values()].sort(
      (a, b) => b.created + b.handed - (a.created + a.handed) || a.name.localeCompare(b.name),
    );
  }, [shownLeads, taskDues, ownerChanges, dayStats]);
  const openCount = shownLeads.filter((l) => !l.stageIsWon && !l.stageIsLost).length;

  const analyticsButton = hasAnalytics ? (
    <button
      type="button"
      onClick={() => setAnalyticsOpen(true)}
      aria-label={t("funnels.analyticsButton")}
      title={t("funnels.analyticsButton")}
      className={ICON_BUTTON}
    >
      <BarChart3 className="h-[18px] w-[18px] text-primary" />
    </button>
  ) : (
    <Link
      to="/billing"
      className="inline-flex h-10 shrink-0 items-center rounded-2xl border border-dashed border-primary/40 px-3 text-[13px] font-semibold text-primary hover:bg-primary/5"
    >
      {t("funnels.statsUpsell")}
    </Link>
  );

  function setView(v: "kanban" | "list" | "tasks") {
    void navigate({
      to: "/funnels",
      search: (prev) => ({ ...prev, view: v }),
      replace: true,
    });
  }

  function updateFilters(next: LeadFilterState) {
    const cf = Object.entries(next.custom)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join(";");
    void navigate({
      to: "/funnels",
      search: (prev) => ({
        funnel: next.funnel ?? undefined,
        owner: next.ownerIds.length ? next.ownerIds.join(",") : undefined,
        stage: next.stageIds.length ? next.stageIds.join(",") : undefined,
        tags: next.tags.length ? next.tags.join(",") : undefined,
        sources: next.sources.length ? next.sources.join(",") : undefined,
        campaigns: next.campaigns.length ? next.campaigns.join(",") : undefined,
        streams: next.streams.length ? next.streams.join(",") : undefined,
        q: next.search || undefined,
        name: next.name || undefined,
        min: next.amount.min != null ? String(next.amount.min) : undefined,
        max: next.amount.max != null ? String(next.amount.max) : undefined,
        preset: next.preset || undefined,
        tasks: next.tasks || undefined,
        cf: cf || undefined,
        view,
        from: prev.from,
        to: prev.to,
        label: prev.label,
      }),
      replace: true,
    });
  }

  // AmoCRM board / list as icons only; the name shows on hover.
  const views = [
    ...(canViewPipeline
      ? [{ key: "kanban" as const, icon: KanbanSquare, label: t("leadFilter.kanban") }]
      : []),
    { key: "list" as const, icon: List, label: t("leadFilter.list") },
  ];
  const viewToggle = (
    <TooltipProvider delayDuration={150}>
      <div className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-2xl border border-border bg-card p-1">
        {views.map((v) => (
          <Tooltip key={v.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setView(v.key)}
                aria-label={v.label}
                aria-pressed={view === v.key}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl transition-colors",
                  view === v.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <v.icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{v.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );

  // The "Vazifalar" button's live counts -- the same split the tasks view shows.
  const now = useNowTick();
  const taskBuckets = useMemo(
    () => bucketFunnelTasks(shownLeads, openTasks, now),
    [shownLeads, openTasks, now],
  );
  const tasksButton = (
    <button
      type="button"
      onClick={() => setView(view === "tasks" ? (canViewPipeline ? "kanban" : "list") : "tasks")}
      aria-pressed={view === "tasks"}
      aria-label={t("ftasks.button")}
      title={t("ftasks.hintCounts", {
        overdue: taskBuckets.overdue.length,
        today: taskBuckets.today.length,
        upcoming: taskBuckets.upcoming.length,
      })}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-bold transition-[filter,background-color,border-color]",
        view === "tasks"
          ? "border-red-600 bg-red-600 text-white hover:brightness-110"
          : "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300",
      )}
    >
      <span className="relative grid h-6 w-6 place-items-center">
        <AlarmClock className="h-[18px] w-[18px]" strokeWidth={2.4} />
        {taskBuckets.overdue.length > 0 && view !== "tasks" && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-red-600 ring-2 ring-card" />
        )}
      </span>
      {/* Overdue first: the number that needs action; else what is due today. */}
      {(taskBuckets.overdue.length > 0 || taskBuckets.today.length > 0) && (
        <span
          className={cn(
            "min-w-[22px] rounded-full px-1.5 py-px text-center text-[11.5px] font-extrabold tabular-nums",
            view === "tasks"
              ? "bg-white/25 text-white"
              : taskBuckets.overdue.length > 0
                ? "bg-red-600 text-white"
                : "bg-emerald-500 text-white",
          )}
        >
          {taskBuckets.overdue.length > 0 ? taskBuckets.overdue.length : taskBuckets.today.length}
        </span>
      )}
    </button>
  );

  const total = shownLeads.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0);
  // Ticked leads the current filters still show; the bar stays while any is ticked.
  const selectedIds = shownLeads.filter((l) => selected.has(l.id)).map((l) => l.id);
  const selecting = bulk || selectedIds.length > 0;

  return (
    <>
      {/* Pinned under the app's own top bar so filters/view controls never
          scroll away on a page that's worked in all day -- the title row
          is icon-back + name only (no description, no full PageHeader),
          and the filter tiles below it use the platform's compact size, so
          together they cost as little vertical space as possible before
          the actual lead board starts. <main> (AppShell) is its own
          scroll container that already starts right below the app's
          header, so this sticks at top-0 of THAT box, not top-14 -- top-14
          would (and did) reserve a second, redundant header-height gap on
          top of the real one. -mt-4 cancels main's own pt-4 so the bar
          sits flush against its scroll boundary instead of leaving that
          padding as dead space above it. */}
      {/* A strip of its own tone (lighter than the page in dark mode too),
          so the toolbar reads as one row above the board. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 border-b border-border bg-card px-4 pb-2.5 pt-2.5 sm:mb-4 md:-mx-6 md:px-6 phone:-mx-3 phone:px-3">
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          <Link
            to="/funnels"
            aria-label={t("funnels.backToFunnels")}
            title={t("funnels.backToFunnels")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {/* Name, then how many leads and what they're worth -- the sum
              big enough to read at a glance. */}
          <div className="flex min-w-0 shrink-0 items-center gap-3 pr-1 phone:shrink phone:gap-2">
            <h1 className="max-w-[260px] truncate phone:max-w-[150px] text-[15px] font-extrabold uppercase tracking-wide text-foreground sm:text-base">
              {name}
            </h1>
            <span className="h-7 w-px bg-border" />
            {/* "6 ta lid: 10 013 613 088 so'm" -- the count small, the sum larger. */}
            <p className="flex items-baseline gap-1.5 whitespace-nowrap leading-none">
              <span className="text-[13px] font-medium text-muted-foreground">
                {t("pipeline.columnCount", { count: shownLeads.length })}
                {canViewRevenue ? ":" : ""}
              </span>
              {canViewRevenue && (
                <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-foreground">
                  {format(total)}
                </span>
              )}
            </p>
          </div>
          <div className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:ml-3 lg:w-auto lg:flex-1">
            <FunnelSearchFilter
              value={filters}
              onChange={updateFilters}
              date={dateFilter}
              onDateChange={setDateFilter}
              leads={dateScopedLeads}
              owners={funnelOwners}
              stages={funnelStages}
              fieldDefs={fieldDefs}
              meId={user?.id ?? null}
            />
            <SaveFiltersButton
              changed={funnelSaved.changed}
              saved={funnelSaved.saved}
              onSave={funnelSaved.save}
              onForget={funnelSaved.forget}
              className="sm:h-10"
            />
          </div>
          {/* Phone: its own row, spread across the width. */}
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-1 phone:ml-0 phone:w-full phone:justify-between phone:gap-1.5">
            {tasksButton}
            {viewToggle}
            {analyticsButton}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              title={t("mreport.title")}
              aria-label={t("mreport.button")}
              className={cn(ICON_BUTTON, "phone:hidden")}
            >
              <FileText className="h-[18px] w-[18px] text-primary" />
            </button>
            <KanbanToolbarMenu
              funnel={name}
              leads={shownLeads}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              autoRefresh={autoRefresh}
              onAutoRefreshChange={onAutoRefreshChange}
              boardOptions={view === "kanban"}
              onBulkActions={() => {
                setSelected(new Set());
                setBulk(true);
              }}
              {...(canManageLeads
                ? {
                    onDistribute: () => setDistributeOpen(true),
                    onStageMessage: () => setStageMessageOpen(true),
                  }
                : {})}
            />
            <button
              type="button"
              onClick={() => setNewLeadOpen(true)}
              title={t("newLead.title")}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden xl:inline">{t("newLead.button")}</span>
            </button>
          </div>
        </div>
        {selecting && (
          <FunnelBulkBar
            ids={selectedIds}
            allIds={shownLeads.map((l) => l.id)}
            leads={shownLeads}
            stages={stages ?? []}
            owners={profiles ?? []}
            onSelectAll={() => setSelected(new Set(shownLeads.map((l) => l.id)))}
            onDone={() => setSelected(new Set())}
            onCancel={() => {
              setBulk(false);
              setSelected(new Set());
            }}
          />
        )}
      </div>

      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <ManagerReportDialog open={reportOpen} onOpenChange={setReportOpen} funnel={name} />
      {distributeOpen && (
        <LeadDistributeWindow
          leads={leads}
          stages={funnelStages}
          owners={profiles ?? []}
          sortBy={sortBy}
          onClose={() => setDistributeOpen(false)}
        />
      )}
      {stageMessageOpen && (
        <StageMessageWindow
          leads={leads}
          stages={funnelStages}
          sortBy={sortBy}
          onClose={() => setStageMessageOpen(false)}
        />
      )}

      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-0">
          <DialogHeader className="border-b border-border px-6 pb-4 pt-5">
            <DialogTitle className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/12 text-primary">
                <BarChart3 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold">{t("funnels.analyticsButton")}</span>
                <span className="block truncate text-[12.5px] font-medium text-muted-foreground">
                  {name} · {dateFilter.label}
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>
          {/* Today, amoCRM-style: the numbers a rep starts the day with. */}
          <div className="grid gap-3 px-6 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <DayStat
              label={t("funnels.day.tasksToday")}
              value={String(dayStats.tasksToday)}
              tone="text-success"
            />
            <DayStat
              label={t("funnels.day.noTasks")}
              value={String(dayStats.noTasks)}
              tone="text-amber-600 dark:text-amber-400"
            />
            <DayStat
              label={t("funnels.day.overdue")}
              value={String(dayStats.overdueTasks)}
              tone="text-destructive"
            />
            <DayStat
              label={t("funnels.day.newLeads")}
              value={`${dayStats.newToday} / ${dayStats.newYesterday}`}
              tone="text-primary"
            />
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <FunnelMetric
              icon={Users}
              label={t("funnels.leadsInFunnel")}
              value={String(shownLeads.length)}
              hint={t("funnels.allStages")}
              info={t("funnels.leadsInFunnelInfo")}
              tone="primary"
            />
            <FunnelMetric
              icon={TrendingUp}
              label={t("funnels.lateFunnelConversion")}
              value={`${lateFunnelConversionRate}%`}
              hint={t("funnels.lateFunnelConversionHint")}
              info={t("funnels.lateFunnelConversionInfo")}
              progress={lateFunnelConversionRate}
              tone="primary"
            />
            <FunnelMetric
              icon={Wallet}
              label={t("funnels.lateFunnelRevenue")}
              value={format(stageMeta.lateFunnelRevenue)}
              hint={t("funnels.lateFunnelRevenueHint")}
              info={t("funnels.lateFunnelRevenueInfo")}
              tone="success"
            />
            <FunnelMetric
              icon={XCircle}
              label={t("funnels.lostLeadsCount")}
              value={String(lostCount)}
              hint={t("funnels.lostLeadsHint")}
              info={t("funnels.lostLeadsCountInfo")}
              tone="danger"
            />
            <FunnelMetric
              icon={Trophy}
              label={t("funnels.fullPaymentCount")}
              value={String(stageMeta.fullPaymentCount)}
              hint={t("funnels.fullPaymentCountHint")}
              info={t("funnels.fullPaymentCountInfo")}
              tone="success"
            />
            <FunnelMetric
              icon={CircleDollarSign}
              label={t("funnels.avgLateFunnelDeal")}
              value={format(avgLateFunnelDeal)}
              hint={t("funnels.avgLateFunnelDealHint")}
              info={t("funnels.avgLateFunnelDealInfo")}
              tone="primary"
            />
            <FunnelMetric
              icon={Percent}
              label={t("funnels.fullPaymentConversionRate")}
              value={`${fullPaymentConversionRate}%`}
              hint={t("funnels.fullPaymentConversionRateHint")}
              info={t("funnels.fullPaymentConversionRateInfo")}
              progress={fullPaymentConversionRate}
              tone="success"
            />
            <FunnelMetric
              icon={ClipboardList}
              label={t("funnels.openLeads")}
              value={String(openCount)}
              hint={t("funnels.openLeadsHint")}
              info={t("funnels.openLeadsHint")}
              tone="warning"
            />
          </div>

          {/* Who got what today -- each salesperson's day in this funnel. */}
          <div className="px-6 pb-6">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-subtle">
              {t("funnels.byOwnerToday")}
            </p>
            {ownerToday.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-subtle">
                {t("funnels.noLeads")}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">{t("funnels.col.owner")}</th>
                      <th className="px-3 py-2.5 text-right">{t("funnels.col.totalToday")}</th>
                      <th className="px-3 py-2.5 text-right">{t("funnels.col.newToday")}</th>
                      <th className="px-3 py-2.5 text-right">{t("funnels.col.handedToday")}</th>
                      <th className="px-3 py-2.5 text-right">{t("funnels.col.tasksToday")}</th>
                      <th className="px-3 py-2.5 text-right">{t("funnels.col.overdue")}</th>
                      <th className="px-4 py-2.5 text-right">{t("funnels.col.noTasks")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ownerToday.map((r) => (
                      <tr key={r.id} className="tabular-nums">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2 font-semibold text-foreground">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                              {r.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="truncate">{r.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[15px] font-extrabold text-foreground">
                          {r.created + r.handed}
                        </td>
                        <td className="px-3 py-2.5 text-right text-foreground">{r.created}</td>
                        <td className="px-3 py-2.5 text-right text-foreground">{r.handed}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-success">
                          {r.tasks}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-semibold",
                            r.overdue ? "text-destructive" : "text-subtle",
                          )}
                        >
                          {r.overdue}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-semibold",
                            r.noTasks ? "text-amber-600 dark:text-amber-400" : "text-subtle",
                          )}
                        >
                          {r.noTasks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LiveRegistrationsPopup items={live} />

      {view === "tasks" ? (
        <FunnelTasksBoard leads={shownLeads} tasks={openTasks} />
      ) : view === "kanban" ? (
        // Straight on the page, no card around it -- amoCRM's columns sit
        // on the plain background.
        <PipelineBoard
          funnel={name}
          leads={shownLeads}
          stages={stages ?? []}
          sortBy={sortBy}
          liveIds={liveIds}
          // Tick boxes only while "Ommaviy amallar" is on.
          {...(selecting
            ? {
                selection: {
                  ids: selected,
                  onToggle: toggleSelected,
                  onSetMany: (ids: string[], on: boolean) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const id of ids) {
                        if (on) next.add(id);
                        else next.delete(id);
                      }
                      return next;
                    }),
                },
              }
            : {})}
        />
      ) : (
        <SectionCard>
          {shownLeads.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle">{t("funnels.noLeads")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <LeadListHeader
                    selection={{
                      all: shownLeads.length > 0 && shownLeads.every((l) => selected.has(l.id)),
                      some: selected.size > 0,
                      onToggleAll: () =>
                        setSelected(
                          shownLeads.every((l) => selected.has(l.id))
                            ? new Set()
                            : new Set(shownLeads.map((l) => l.id)),
                        ),
                    }}
                  />
                </thead>
                <tbody>
                  {shownLeads.map((lead) => (
                    <LeadListRow
                      key={lead.id}
                      lead={lead}
                      getAmoLink={getAmoLink}
                      selection={{
                        checked: selected.has(lead.id),
                        onToggle: () => toggleSelected(lead.id),
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <NewFunnelLeadDialog
        open={newLeadOpen}
        onOpenChange={setNewLeadOpen}
        funnel={name}
        stages={funnelStages}
      />
    </>
  );
}
