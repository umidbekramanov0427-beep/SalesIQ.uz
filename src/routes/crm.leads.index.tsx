import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Filter,
  Pin,
  Plus,
  Search,
  Star,
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  Pill,
  ExportButton,
} from "@/components/layout/Primitives";
import { SAVED_VIEWS } from "@/lib/crm-data";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLeadsListPage, usePipelineStagesRaw } from "@/hooks/use-crm-data";
import { NewLeadDialog } from "@/components/crm/quick-create";
import { PermissionGate } from "@/components/PermissionGate";
import { FilterSearchInput } from "@/components/filters/FilterSelect";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

export const Route = createFileRoute("/crm/leads/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    stage?: string | undefined;
    q?: string | undefined;
    sort?: "asc" | undefined;
    page?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    label?: string | undefined;
  } => ({
    stage: typeof search["stage"] === "string" ? search["stage"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    sort: search["sort"] === "asc" ? "asc" : undefined,
    page: typeof search["page"] === "string" ? search["page"] : undefined,
    from: typeof search["from"] === "string" ? search["from"] : undefined,
    to: typeof search["to"] === "string" ? search["to"] : undefined,
    label: typeof search["label"] === "string" ? search["label"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Leads — SalesIQ CRM" },
      {
        name: "description",
        content:
          "Enterprise lead register with saved views, advanced filters, scoring, bulk actions, import and export.",
      },
      { property: "og:title", content: "Leads — SalesIQ CRM" },
      {
        property: "og:description",
        content: "Search, filter, group and act on every lead in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPageGated,
});

function LeadsPageGated() {
  return (
    <PermissionGate action="View leads">
      <LeadsPage />
    </PermissionGate>
  );
}

const tempTone = (t: string): "danger" | "warning" | "info" =>
  t === "Hot" ? "danger" : t === "Warm" ? "warning" : "info";

const PAGE_SIZE = 50;

function LeadsPage() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const search = Route.useSearch();
  const stageFilter = search.stage;
  const navigate = Route.useNavigate();

  // Search text, sort direction and page live in the URL, not local state,
  // so refresh/back-navigation returns you to exactly the same list view
  // instead of resetting it. queryInput is just the input box's live value
  // (debounced before it becomes the committed, URL-backed `query`).
  const [queryInput, setQueryInput] = useState(() => search.q ?? "");
  const query = search.q ?? "";
  const [view, setView] = useState<string>(SAVED_VIEWS[0] ?? "All leads");
  const [selected, setSelected] = useState<string[]>([]);
  const sortDesc = search.sort !== "asc";
  const page = search.page !== undefined ? Number(search.page) : 0;

  function setPage(v: number) {
    void navigate({
      search: (prev) => ({ ...prev, page: v > 0 ? String(v) : undefined }),
      replace: true,
    });
  }
  function setSortDesc(v: boolean) {
    void navigate({ search: (prev) => ({ ...prev, sort: v ? undefined : "asc" }), replace: true });
  }

  // These 4 header cards always reflect the all-time total regardless of
  // the date filter below (only the list itself is date-limited) -- append
  // that caveat to each card's tooltip whenever a filter is actually set,
  // so the number doesn't look like a bug when it doesn't move.
  function withAllTimeCaveat(info: string): string {
    return dateFilter.from || dateFilter.to ? `${info} ${t("leads.statsAllTimeHint")}` : info;
  }

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
      search: (prev) => ({
        ...prev,
        from: v.from ? v.from.toISOString() : undefined,
        to: v.to ? v.to.toISOString() : undefined,
        label: v.label || undefined,
        page: undefined,
      }),
      replace: true,
    });
  }

  // Debounce the search box so every keystroke doesn't fire a new server
  // query — 350ms of no typing before it actually searches.
  useEffect(() => {
    const id = setTimeout(() => {
      if (queryInput !== query) {
        void navigate({
          search: (prev) => ({ ...prev, q: queryInput || undefined, page: undefined }),
          replace: true,
        });
      }
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  // Reset to page 1 whenever the filters change underneath the current page.
  useEffect(() => {
    if (page !== 0) {
      void navigate({ search: (prev) => ({ ...prev, page: undefined }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, stageFilter, search.from, search.to]);

  // The URL's ?stage= param carries a stage *name* (for shareable links);
  // resolve it to the id the server-side filter needs. Stages is a small,
  // already-cached table, so this costs nothing extra.
  const { data: stages } = usePipelineStagesRaw();
  const stageId = useMemo(
    () => (stageFilter ? ((stages ?? []).find((s) => s.name === stageFilter)?.id ?? null) : null),
    [stages, stageFilter],
  );

  const { rows, stats, isLoading, isFetching } = useLeadsListPage({
    page,
    pageSize: PAGE_SIZE,
    search: query,
    stageId,
    sortDesc,
    from: dateFilter.from ? dateFilter.from.toISOString() : null,
    to: dateFilter.to ? dateFilter.to.toISOString() : null,
  });

  const totalPages = Math.max(1, Math.ceil(stats.total / PAGE_SIZE));
  const allSelected = selected.length > 0 && selected.length === rows.length;

  return (
    <>
      <PageHeader
        title={t("leads.title")}
        description={t("leads.desc")}
        actions={
          <>
            <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground hover:bg-accent">
              <Upload className="h-4 w-4" /> {t("leads.import")}
            </button>
            <ExportButton
              filename="leads"
              rows={rows.map((l) => ({
                Name: l.name,
                Company: l.company,
                Owner: l.owner,
                Stage: l.stage,
                Email: l.email,
                Phone: l.phone,
                Score: l.score,
                Temperature: l.temperature,
                ExpectedRevenue: l.expectedRevenue,
                Source: l.source,
                Updated: l.updated,
              }))}
            />
            <NewLeadDialog
              trigger={
                <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <Plus className="h-4 w-4" /> {t("leads.newLead")}
                </button>
              }
            />
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("leads.activeLeads")}
          value={String(stats.total)}
          hint={t("leads.allFunnels")}
          tone="mint"
          info={withAllTimeCaveat(t("leads.activeLeadsInfo"))}
        />
        <StatCard
          label={t("leads.hotLeads")}
          value={String(stats.hot)}
          hint={t("leads.scoreHint")}
          info={withAllTimeCaveat(t("leads.hotLeadsInfo"))}
        />
        <StatCard
          label={t("leads.avgScore")}
          value={String(stats.avgScore)}
          info={withAllTimeCaveat(t("leads.avgScoreInfo"))}
        />
        <StatCard
          label={t("leads.openValue")}
          value={format(stats.revenue)}
          info={withAllTimeCaveat(t("leads.openValueInfo"))}
        />
      </div>

      {isLoading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("leads.loading")}
        </div>
      )}

      {stageFilter && (
        <div className="mt-6 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-mint px-3 py-1.5 text-xs font-medium text-mint-foreground">
            {t("leads.stageFilter", { stage: stageFilter })}
            <button
              onClick={() => void navigate({ search: (prev) => ({ ...prev, stage: undefined }) })}
              className="rounded-full p-0.5 hover:bg-background/40"
              aria-label={t("leads.clearFilter")}
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {SAVED_VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
              view === v
                ? "border-primary/40 bg-mint text-mint-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {v === SAVED_VIEWS[0] ? (
              <Star className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
            {v}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard
          title={view}
          description={t("leads.groupDesc", { shown: rows.length, total: stats.total })}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <FilterSearchInput
                icon={Search}
                label={t("leadFilter.searchLabel")}
                value={queryInput}
                onChange={setQueryInput}
                placeholder={t("leads.searchPlaceholder")}
              />
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="inline-flex h-14 w-64 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-background text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                {t("leads.score")}{" "}
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", !sortDesc && "rotate-180")}
                />
              </button>
              <button className="inline-flex h-14 w-64 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-background text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">
                <Filter className="h-4 w-4" /> {t("leads.filters")}
              </button>
            </div>
          }
        >
          {selected.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-mint-border bg-mint px-4 py-3 text-sm">
              <span className="font-semibold text-mint-foreground">
                {t("leads.selectedCount", { count: selected.length })}
              </span>
              {[
                t("leads.bulkAssignOwner"),
                t("leads.bulkChangeStage"),
                t("leads.bulkAddTag"),
                t("leads.bulkMerge"),
                t("leads.export"),
                t("leads.bulkDelete"),
              ].map((a) => (
                <button
                  key={a}
                  className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          <div className="-m-6 overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-6 py-3">
                    <input
                      type="checkbox"
                      aria-label={t("leads.selectAll")}
                      checked={allSelected}
                      onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                    />
                  </th>
                  {[
                    t("leads.colLead"),
                    t("leads.colCompany"),
                    t("leads.colStage"),
                    t("leads.colOwner"),
                    t("leads.colScore"),
                    t("leads.colTemp"),
                    t("leads.colExpected"),
                    t("leads.colNextFollowUp"),
                    t("leads.colUpdated"),
                  ].map((h) => (
                    <th key={h} className="px-6 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={t("leads.selectOne", { name: l.name })}
                        checked={selected.includes(l.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to="/crm/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="flex items-center gap-3"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-xs font-semibold text-mint-foreground">
                          {l.initials}
                        </span>
                        <span>
                          <span className="block font-medium text-foreground hover:text-primary">
                            {l.name}
                          </span>
                          <span className="block text-xs text-subtle">
                            {l.id} · {l.position}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{l.company}</td>
                    <td className="px-6 py-4">
                      <Pill tone={l.stage === "Won" ? "success" : "info"}>{l.stage}</Pill>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{l.owner}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-success"
                            style={{ width: `${l.score}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">{l.score}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Pill tone={tempTone(l.temperature)}>{l.temperature}</Pill>
                    </td>
                    <td className="px-6 py-4 font-medium">{format(l.expectedRevenue)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{l.nextFollowUp}</td>
                    <td className="px-6 py-4 text-subtle">{l.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && !isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("leads.emptyState")}
            </p>
          )}

          <div className="-mx-5 -mb-5 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 pt-4 text-xs text-subtle">
            <span>{t("leads.showingCount", { shown: rows.length, total: stats.total })}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0 || isFetching}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 font-medium text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> {t("leads.prevPage")}
              </button>
              <span className="font-medium text-foreground">
                {t("leads.pageOf", { page: page + 1, pages: totalPages })}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page + 1 >= totalPages || isFetching}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 font-medium text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("leads.nextPage")} <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
