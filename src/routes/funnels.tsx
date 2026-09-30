import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  KanbanSquare,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  X,
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
import { LeadFilterBar, filterLeads, type LeadFilterState } from "@/components/crm/LeadFilterBar";
import { KanbanToolbarMenu, type PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { PipelineBoard } from "@/components/crm/PipelineBoard";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { planHasFeature } from "@/lib/plan-gating";
import { cn } from "@/lib/utils";
import {
  useAmoCrmLink,
  useAmoCrmTaskStats,
  useFunnelListStats,
  usePermission,
  usePipelineBoardLeads,
  usePipelineStagesRaw,
  useProfilesRaw,
  normalizeStageName,
  SALES_STAGE_KEYWORDS,
  FULL_PAYMENT_STAGE_KEYWORDS,
  type CrmLeadView,
  type FunnelStat,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/funnels")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    funnel?: string | undefined;
    owner?: string | undefined;
    stage?: string | undefined;
    tags?: string | undefined;
    sources?: string | undefined;
    q?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    view?: "kanban" | "gallery" | "list" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    label?: string | undefined;
  } => ({
    funnel: typeof search["funnel"] === "string" ? search["funnel"] : undefined,
    owner: typeof search["owner"] === "string" ? search["owner"] : undefined,
    stage: typeof search["stage"] === "string" ? search["stage"] : undefined,
    tags: typeof search["tags"] === "string" ? search["tags"] : undefined,
    sources: typeof search["sources"] === "string" ? search["sources"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    min: typeof search["min"] === "string" ? search["min"] : undefined,
    max: typeof search["max"] === "string" ? search["max"] : undefined,
    view:
      search["view"] === "kanban" || search["view"] === "gallery" || search["view"] === "list"
        ? search["view"]
        : undefined,
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    to: typeof search["to"] === "string" ? search["to"] : undefined,
    label: typeof search["label"] === "string" ? search["label"] : undefined,
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
      <PageHeader title={t("funnels.title")} description={t("funnels.navigatorDesc")} />

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
            className="surface-card group relative block overflow-hidden p-5 transition-all before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-primary hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-400">
                <RefreshCw className="h-3 w-3" /> AmoCRM
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="min-w-0 truncate text-base font-bold text-foreground">{f.name}</p>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-extrabold leading-none text-foreground">{f.count}</p>
                <p className="mt-1 text-[11px] text-subtle">{t("funnels.openLeads")}</p>
              </div>
            </div>

            <HeatBar hot={f.hot} warm={f.warm} cold={f.cold} />

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="font-semibold text-foreground">{format(f.value)}</span>
              <span className="font-semibold text-success">
                {f.conversion}% {t("funnels.conversion")}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" /> {t("funnels.synced")}
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

function LeadGalleryCard({
  lead,
  getAmoLink,
}: {
  lead: CrmLeadView;
  getAmoLink: (id: number | null) => string | null;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const amoLink = getAmoLink(lead.amocrmId);

  return (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: lead.id }}
      search={{ from: "funnels" }}
      className="group relative block rounded-xl border border-border bg-background p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
    >
      {amoLink && (
        <a
          href={amoLink}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-foreground/90 px-1.5 py-0.5 text-[10px] font-bold text-background transition-opacity hover:opacity-80"
        >
          {t("leadFilter.openInAmoCrm")} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      <div className="flex items-center gap-2 pr-16">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-mint text-[10px] font-semibold text-mint-foreground">
          {lead.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-foreground">
            {lead.company || lead.name}
          </p>
          <p className="truncate text-[11px] text-subtle">{lead.owner}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tone={lead.stage === "Won" ? "success" : lead.stage === "Lost" ? "danger" : "info"}>
          {lead.stage}
        </Pill>
        {lead.temperature && <TemperatureChip temperature={lead.temperature} />}
      </div>

      <LeadPhoneChip phone={lead.phone} leadId={lead.id} />

      {lead.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag} tag={tag} size="xs" />
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="text-[13px] font-bold text-foreground">
          {format(lead.expectedRevenue)}
        </span>
        <span className="text-[11px] text-subtle">
          {t("leadFilter.created")} {lead.created}
        </span>
      </div>
    </Link>
  );
}

// Column order is deliberately most- to least-important, left to right:
// who the lead is, where it sits in the pipeline, its tags, who owns it,
// how much it's worth, whether it's still open, then the AmoCRM deep link.
function LeadListHeader() {
  const { t } = useI18n();
  return (
    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
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
}: {
  lead: CrmLeadView;
  getAmoLink: (id: number | null) => string | null;
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
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent">
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

function FunnelDetail({
  name,
  leads,
  isLoading,
  autoRefresh,
  onAutoRefreshChange,
}: {
  name: string;
  leads: CrmLeadView[];
  isLoading: boolean;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const search = Route.useSearch();
  // The AmoCRM board used to be its own permission-gated page ("View
  // pipeline") -- folded in here as a view mode, someone without that
  // permission just doesn't get the option and stays on list/gallery.
  const canViewPipeline = usePermission("View pipeline");
  const { user } = useAuth();
  const hasAnalytics = planHasFeature(user?.orgPlan, "analytics");

  // The 8 stat cards used to push the lead board down the page every time
  // they were expanded -- this is a CRM board people work in all day, so
  // the board itself now always stays put right under the filters, and the
  // numbers live behind an "Analitika" button that opens them in a dialog
  // instead of shifting the layout underneath.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  // Owned here (not inside PipelineBoard) so it survives the board's own
  // remounts and so the "..." toolbar that controls it can live in the
  // filter row instead of floating above the board -- see KanbanToolbarMenu.
  const [sortBy, setSortBy] = useState<PipelineSortBy>("created");

  // Filters (and the gallery/list toggle) live in the URL, not local state,
  // so refresh/back-navigation returns you to exactly the same filtered
  // view of this funnel instead of resetting it.
  const filters: LeadFilterState = useMemo(
    () => ({
      funnel: name,
      ownerId: search.owner ?? null,
      tags: search.tags ? search.tags.split(",").filter(Boolean) : [],
      stageId: search.stage ?? null,
      search: search.q ?? "",
      amount: {
        min: search.min !== undefined ? Number(search.min) : null,
        max: search.max !== undefined ? Number(search.max) : null,
      },
      sources: search.sources ? search.sources.split(",").filter(Boolean) : [],
    }),
    [
      name,
      search.owner,
      search.tags,
      search.stage,
      search.q,
      search.min,
      search.max,
      search.sources,
    ],
  );
  // Defaults to the AmoCRM board (the primary way to work a funnel day to
  // day) unless the role can't see it, in which case gallery is the fallback
  // -- same as if they'd never had the "AmoCRM" option to pick in the first
  // place.
  const requestedView: "kanban" | "gallery" | "list" =
    search.view === "list" ? "list" : search.view === "gallery" ? "gallery" : "kanban";
  const view = requestedView === "kanban" && !canViewPipeline ? "gallery" : requestedView;

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
  // Everything below (stat cards, owner/tag cascade, gallery/list) derives
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

  const { data: profiles } = useProfilesRaw();
  const { data: stages } = usePipelineStagesRaw();
  const getAmoLink = useAmoCrmLink();

  // Egalar/teglar filtrlari shu voronkadagi lidlarga tegishli bo'lishi
  // kerak -- butun akkaunt bo'yicha emas, aks holda boshqa voronkalarning
  // egalari/teglari ham ko'rinib, ishlatib bo'lmaydigan variantlar chiqadi.
  const funnelOwners = useMemo(() => {
    const ownerIds = new Set(dateScopedLeads.map((l) => l.ownerId).filter(Boolean));
    return (profiles ?? []).filter((p) => ownerIds.has(p.id));
  }, [dateScopedLeads, profiles]);
  const funnelTags = useMemo(() => {
    const set = new Set<string>();
    for (const l of dateScopedLeads) for (const tag of l.tags) set.add(tag);
    return Array.from(set).sort();
  }, [dateScopedLeads]);
  const funnelSources = useMemo(() => {
    const set = new Set<string>();
    for (const l of dateScopedLeads) if (l.source) set.add(l.source);
    return Array.from(set).sort();
  }, [dateScopedLeads]);

  const gallery = useMemo(
    () => filterLeads(dateScopedLeads, { ...filters, funnel: null }),
    [dateScopedLeads, filters],
  );

  // The 3 "late funnel" stages the user defined: prepayment ("Predoplata"/
  // "Peredoplata"), half payment ("Yarim to'lov"), and full payment/won
  // ("To'liq to'lov", "WON", "Успешно...", or "ROP Closed") -- the same
  // SALES_STAGE_KEYWORDS/FULL_PAYMENT_STAGE_KEYWORDS matching already used
  // for the daily report's sales-stage detection, reused here for
  // consistency instead of a second ad-hoc keyword list.
  //
  // Built from `gallery` (the fully filtered set: date + owner/stage/tag/
  // search/amount), not just `dateScopedLeads` -- these 8 cards used to
  // ignore every filter except the date range, so picking an owner/tag/
  // amount in the filter bar shrank the lead list below without changing a
  // single number above it.
  const stageMeta = useMemo(() => {
    let lateFunnelCount = 0;
    let lateFunnelRevenue = 0;
    let fullPaymentCount = 0;
    for (const l of gallery) {
      const stageName = normalizeStageName(l.stage);
      const isSalesStage = SALES_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
      const isFullPayment = FULL_PAYMENT_STAGE_KEYWORDS.some((kw) => stageName.includes(kw));
      if (isSalesStage) {
        lateFunnelCount += 1;
        lateFunnelRevenue += l.expectedRevenue;
      }
      if (isFullPayment) fullPaymentCount += 1;
    }
    return { lateFunnelCount, lateFunnelRevenue, fullPaymentCount };
  }, [gallery]);

  const lateFunnelConversionRate = gallery.length
    ? Math.round((stageMeta.lateFunnelCount / gallery.length) * 1000) / 10
    : 0;
  const lostCount = gallery.filter((l) => l.stageIsLost).length;
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

  const { data: taskStats } = useAmoCrmTaskStats(name);
  const dueToday = taskStats?.dueToday ?? 0;
  const overdue = taskStats?.overdue ?? 0;

  const analyticsButton = hasAnalytics ? (
    <button
      type="button"
      onClick={() => setAnalyticsOpen(true)}
      aria-label={t("funnels.analyticsButton")}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent sm:h-9 sm:gap-2 sm:px-3.5"
    >
      <BarChart3 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{t("funnels.analyticsButton")}</span>
    </button>
  ) : (
    <Link
      to="/billing"
      className="inline-flex h-9 shrink-0 items-center rounded-xl border border-dashed border-primary/40 px-2 text-xs font-semibold text-primary hover:bg-primary/5 sm:px-3.5"
    >
      {t("funnels.statsUpsell")}
    </Link>
  );

  function setView(v: "kanban" | "gallery" | "list") {
    void navigate({
      to: "/funnels",
      search: (prev) => ({ ...prev, view: v }),
      replace: true,
    });
  }

  function updateFilters(next: LeadFilterState) {
    void navigate({
      to: "/funnels",
      search: {
        funnel: next.funnel ?? undefined,
        owner: next.ownerId ?? undefined,
        stage: next.stageId ?? undefined,
        tags: next.tags.length ? next.tags.join(",") : undefined,
        sources: next.sources.length ? next.sources.join(",") : undefined,
        q: next.search || undefined,
        min: next.amount.min != null ? String(next.amount.min) : undefined,
        max: next.amount.max != null ? String(next.amount.max) : undefined,
        view,
      },
      replace: true,
    });
  }

  // Sits in Row 1, right in front of the AmoCRM/List/Gallery toggle -- a
  // proper rounded search pill (icon + expanding input) instead of the
  // two-line filter-tile shape the rest of the filter row uses, since it's
  // reached for constantly and needs to read as a search box, not one more
  // dropdown-shaped tile.
  const searchPill = (
    <div className="relative h-8 shrink-0 sm:h-9">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground sm:left-3 sm:h-3.5 sm:w-3.5" />
      <input
        value={filters.search}
        onChange={(e) => updateFilters({ ...filters, search: e.target.value })}
        placeholder={t("leadFilter.searchPlaceholder")}
        aria-label={t("leadFilter.searchLabel")}
        className="h-8 w-24 rounded-full border border-border bg-surface pl-7 pr-6 text-[11px] font-medium text-foreground outline-none transition-all placeholder:text-subtle focus:w-44 focus:border-primary focus:ring-1 focus:ring-primary/40 sm:h-9 sm:w-44 sm:pl-8 sm:pr-7 sm:text-[13px] sm:focus:w-64"
      />
      {filters.search && (
        <button
          type="button"
          onClick={() => updateFilters({ ...filters, search: "" })}
          aria-label={t("leadFilter.clearSearch")}
          className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  const viewToggle = (
    <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border p-1 sm:h-9">
      {canViewPipeline && (
        <button
          type="button"
          onClick={() => setView("kanban")}
          aria-label={t("leadFilter.kanban")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5",
            view === "kanban"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <KanbanSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("leadFilter.kanban")}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setView("list")}
        aria-label={t("leadFilter.list")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5",
          view === "list"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("leadFilter.list")}</span>
      </button>
      <button
        type="button"
        onClick={() => setView("gallery")}
        aria-label={t("leadFilter.gallery")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5",
          view === "gallery"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("leadFilter.gallery")}</span>
      </button>
    </div>
  );

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
      <div className="sticky top-0 z-10 -mx-1 -mt-4 mb-3 space-y-1.5 bg-background px-1 pb-2 pt-1.5 sm:mb-4 sm:space-y-2 sm:pb-3 sm:pt-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Link
            to="/funnels"
            aria-label={t("funnels.backToFunnels")}
            title={t("funnels.backToFunnels")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-8 sm:w-8"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-foreground sm:text-lg">
            {name}
          </h1>
          {searchPill}
          {viewToggle}
          {analyticsButton}
          {view === "kanban" && (
            <KanbanToolbarMenu
              funnel={name}
              leads={gallery}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              autoRefresh={autoRefresh}
              onAutoRefreshChange={onAutoRefreshChange}
            />
          )}
        </div>

        {/* flex-nowrap + overflow-x-auto (not flex-wrap) -- this row must
            stay one line at any viewport/zoom, matching the request that
            it never reflow into a second row; it scrolls horizontally
            instead once it's wider than the card. scrollbar-none hides
            the raw OS scrollbar that appears the moment it does -- at a
            high enough zoom that was the only visible artifact, and it
            read as a layout glitch rather than a real control. */}
        <div className="scrollbar-none flex flex-nowrap items-center gap-2 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 sm:gap-3 sm:p-2">
          <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
          <LeadFilterBar
            value={filters}
            onChange={updateFilters}
            funnels={[]}
            showFunnelFilter={false}
            owners={funnelOwners}
            tags={funnelTags}
            sources={funnelSources}
            stages={stages ?? []}
          />
        </div>
      </div>

      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4.5 w-4.5 text-primary" /> {t("funnels.analyticsButton")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard
              label={t("funnels.leadsInFunnel")}
              value={String(gallery.length)}
              hint={t("funnels.allStages")}
              info={t("funnels.leadsInFunnelInfo")}
              tone="mint"
            />
            <StatCard
              label={t("funnels.lateFunnelConversion")}
              value={`${lateFunnelConversionRate}%`}
              hint={t("funnels.lateFunnelConversionHint")}
              info={t("funnels.lateFunnelConversionInfo")}
            />
            <StatCard
              label={t("funnels.lateFunnelRevenue")}
              value={format(stageMeta.lateFunnelRevenue)}
              hint={t("funnels.lateFunnelRevenueHint")}
              info={t("funnels.lateFunnelRevenueInfo")}
            />
            <StatCard
              label={t("funnels.lostLeadsCount")}
              value={String(lostCount)}
              hint={t("funnels.lostLeadsHint")}
              info={t("funnels.lostLeadsCountInfo")}
              tone="danger-soft"
            />
            <StatCard
              label={t("funnels.fullPaymentCount")}
              value={String(stageMeta.fullPaymentCount)}
              hint={t("funnels.fullPaymentCountHint")}
              info={t("funnels.fullPaymentCountInfo")}
              tone="mint"
            />
            <StatCard
              label={t("funnels.avgLateFunnelDeal")}
              value={format(avgLateFunnelDeal)}
              hint={t("funnels.avgLateFunnelDealHint")}
              info={t("funnels.avgLateFunnelDealInfo")}
            />
            <StatCard
              label={t("funnels.fullPaymentConversionRate")}
              value={`${fullPaymentConversionRate}%`}
              hint={t("funnels.fullPaymentConversionRateHint")}
              info={t("funnels.fullPaymentConversionRateInfo")}
            />
            <StatCard
              label={t("funnels.tasksCard")}
              value={String(dueToday + overdue)}
              hint={t("funnels.tasksCardHint", {
                dueToday: String(dueToday),
                overdue: String(overdue),
              })}
              info={t("funnels.tasksCardInfo")}
              {...(overdue > 0 ? { tone: "danger-soft" as const } : {})}
            />
          </div>
        </DialogContent>
      </Dialog>

      <SectionCard>
        {view === "kanban" ? (
          <PipelineBoard funnel={name} leads={gallery} stages={stages ?? []} sortBy={sortBy} />
        ) : gallery.length === 0 ? (
          <p className="py-10 text-center text-sm text-subtle">{t("funnels.noLeads")}</p>
        ) : view === "gallery" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gallery.map((lead) => (
              <LeadGalleryCard key={lead.id} lead={lead} getAmoLink={getAmoLink} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <LeadListHeader />
              </thead>
              <tbody>
                {gallery.map((lead) => (
                  <LeadListRow key={lead.id} lead={lead} getAmoLink={getAmoLink} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
