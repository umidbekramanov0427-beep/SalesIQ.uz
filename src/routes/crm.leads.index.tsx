import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Filter,
  Plus,
  Search,
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Tag as TagIcon,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  StatCard,
  Pill,
  ExportButton,
} from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError } from "@/lib/utils";
import {
  useBulkAddLeadTag,
  useBulkDeleteLeads,
  useBulkUpdateLeads,
  useLeadsListPage,
  usePipelineStagesRaw,
  useProfilesRaw,
  useSendBulkMessage,
  type BulkMessageChannel,
} from "@/hooks/use-crm-data";
import { NewLeadDialog } from "@/components/crm/quick-create";
import { PermissionGate } from "@/components/PermissionGate";
import { FilterSearchInput } from "@/components/filters/FilterSelect";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
  // Deleting leads is the super admin's call only (RLS enforces the same).
  const { user: me } = useAuth();
  const canDeleteLeads = me?.role === "super_admin" || me?.role === "platform_owner";
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
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPanel, setBulkPanel] = useState<"stage" | "owner" | "tag" | "message" | null>(null);
  const [bulkStageId, setBulkStageId] = useState("");
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkMessageChannel, setBulkMessageChannel] = useState<BulkMessageChannel>("sms");
  const [bulkMessageText, setBulkMessageText] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { data: profiles } = useProfilesRaw();
  const bulkUpdate = useBulkUpdateLeads();
  const bulkAddTag = useBulkAddLeadTag();
  const bulkDelete = useBulkDeleteLeads();
  const bulkMessage = useSendBulkMessage();
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

  function closeBulkPanel() {
    setBulkPanel(null);
    setBulkStageId("");
    setBulkOwnerId("");
    setBulkTag("");
    setBulkMessageText("");
  }

  function clearSelection() {
    setSelected([]);
    closeBulkPanel();
  }

  async function applyBulkStage() {
    if (!bulkStageId) return;
    try {
      await bulkUpdate.mutateAsync({ ids: selected, patch: { stage_id: bulkStageId } });
      toast.success(t("leads.bulkStageApplied", { count: selected.length }));
      clearSelection();
    } catch (err) {
      toast.error(describeError(err, t("leads.bulkActionFailed")));
    }
  }

  async function applyBulkOwner() {
    if (!bulkOwnerId) return;
    try {
      await bulkUpdate.mutateAsync({
        ids: selected,
        patch: { owner_id: bulkOwnerId === "__unassign__" ? null : bulkOwnerId },
      });
      toast.success(t("leads.bulkOwnerApplied", { count: selected.length }));
      clearSelection();
    } catch (err) {
      toast.error(describeError(err, t("leads.bulkActionFailed")));
    }
  }

  async function applyBulkTag() {
    const tag = bulkTag.trim();
    if (!tag) return;
    try {
      await bulkAddTag.mutateAsync({ ids: selected, tag });
      toast.success(t("leads.bulkTagApplied", { count: selected.length }));
      clearSelection();
    } catch (err) {
      toast.error(describeError(err, t("leads.bulkActionFailed")));
    }
  }

  async function applyBulkMessage() {
    const text = bulkMessageText.trim();
    if (!text) return;
    try {
      const result = await bulkMessage.mutateAsync({
        leadIds: selected,
        channel: bulkMessageChannel,
        text,
      });
      if (result.failed > 0) {
        toast.warning(t("leads.bulkMessagePartial", { sent: result.sent, failed: result.failed }));
      } else {
        toast.success(t("leads.bulkMessageApplied", { count: result.sent }));
      }
      clearSelection();
    } catch (err) {
      toast.error(describeError(err, t("leads.bulkActionFailed")));
    }
  }

  async function confirmBulkDelete() {
    const count = selected.length;
    try {
      await bulkDelete.mutateAsync(selected);
      toast.success(t("leads.bulkDeleted", { count }));
      setConfirmDeleteOpen(false);
      clearSelection();
    } catch (err) {
      setConfirmDeleteOpen(false);
      toast.error(describeError(err, t("leads.bulkActionFailed")));
    }
  }

  const bulkBusy =
    bulkUpdate.isPending || bulkAddTag.isPending || bulkDelete.isPending || bulkMessage.isPending;

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

      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        <StatCard
          label={t("leads.activeLeads")}
          value={String(stats.total)}
          hint={t("leads.allFunnels")}
          tone="hero"
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

      <div className="mt-6">
        <SectionCard
          actions={
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <FilterSearchInput
                icon={Search}
                label={t("leadFilter.searchLabel")}
                value={queryInput}
                onChange={setQueryInput}
                placeholder={t("leads.searchPlaceholder")}
              />
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="inline-flex h-11 w-56 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                {t("leads.score")}{" "}
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", !sortDesc && "rotate-180")}
                />
              </button>
              <button className="inline-flex h-11 w-56 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent">
                <Filter className="h-3.5 w-3.5" /> {t("leads.filters")}
              </button>
            </div>
          }
        >
          {selected.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-mint-border bg-mint px-4 py-3 text-sm">
                <span className="font-semibold text-mint-foreground">
                  {t("leads.selectedCount", { count: selected.length })}
                </span>
                <button
                  onClick={() => setBulkPanel((p) => (p === "stage" ? null : "stage"))}
                  disabled={bulkBusy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    bulkPanel === "stage"
                      ? "border-primary/40 bg-background text-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {t("leads.bulkChangeStage")}
                </button>
                <button
                  onClick={() => setBulkPanel((p) => (p === "owner" ? null : "owner"))}
                  disabled={bulkBusy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    bulkPanel === "owner"
                      ? "border-primary/40 bg-background text-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <Users className="h-3.5 w-3.5" /> {t("leads.bulkAssignOwner")}
                </button>
                <button
                  onClick={() => setBulkPanel((p) => (p === "tag" ? null : "tag"))}
                  disabled={bulkBusy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    bulkPanel === "tag"
                      ? "border-primary/40 bg-background text-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <TagIcon className="h-3.5 w-3.5" /> {t("leads.bulkAddTag")}
                </button>
                <button
                  onClick={() => setBulkPanel((p) => (p === "message" ? null : "message"))}
                  disabled={bulkBusy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    bulkPanel === "message"
                      ? "border-primary/40 bg-background text-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <MessageSquareText className="h-3.5 w-3.5" /> {t("leads.bulkSendMessage")}
                </button>
                <ExportButton
                  filename="leads-selected"
                  rows={rows
                    .filter((l) => selected.includes(l.id))
                    .map((l) => ({
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
                {canDeleteLeads && (
                  <button
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={bulkBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-background px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t("leads.bulkDelete")}
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-mint-foreground hover:bg-background/40"
                >
                  <X className="h-3.5 w-3.5" /> {t("leads.bulkClearSelection")}
                </button>
              </div>

              {bulkPanel === "stage" && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
                  <select
                    value={bulkStageId}
                    onChange={(e) => setBulkStageId(e.target.value)}
                    className="h-9 flex-1 max-w-xs rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
                  >
                    <option value="">{t("leads.bulkStagePlaceholder")}</option>
                    {(stages ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void applyBulkStage()}
                    disabled={!bulkStageId || bulkUpdate.isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkUpdate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("leads.bulkApply")}
                  </button>
                </div>
              )}

              {bulkPanel === "owner" && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
                  <select
                    value={bulkOwnerId}
                    onChange={(e) => setBulkOwnerId(e.target.value)}
                    className="h-9 flex-1 max-w-xs rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
                  >
                    <option value="">{t("leads.bulkOwnerPlaceholder")}</option>
                    <option value="__unassign__">{t("leads.bulkOwnerUnassigned")}</option>
                    {(profiles ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void applyBulkOwner()}
                    disabled={!bulkOwnerId || bulkUpdate.isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkUpdate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("leads.bulkApply")}
                  </button>
                </div>
              )}

              {bulkPanel === "tag" && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
                  <input
                    value={bulkTag}
                    onChange={(e) => setBulkTag(e.target.value)}
                    placeholder={t("leads.bulkTagPlaceholder")}
                    className="h-9 flex-1 max-w-xs rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
                  />
                  <button
                    onClick={() => void applyBulkTag()}
                    disabled={!bulkTag.trim() || bulkAddTag.isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkAddTag.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("leads.bulkApply")}
                  </button>
                </div>
              )}

              {bulkPanel === "message" && (
                <div className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("leads.bulkMessageChannel")}
                    </span>
                    {(["sms", "whatsapp", "telegram", "email"] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setBulkMessageChannel(ch)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                          bulkMessageChannel === ch
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {t(`leads.bulkMessageChannel.${ch}`)}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-start gap-2">
                    <textarea
                      value={bulkMessageText}
                      onChange={(e) => setBulkMessageText(e.target.value)}
                      placeholder={t("leads.bulkMessagePlaceholder")}
                      rows={3}
                      className="h-20 flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={() => void applyBulkMessage()}
                      disabled={!bulkMessageText.trim() || bulkMessage.isPending}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkMessage.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("leads.bulkApply")}
                    </button>
                  </div>
                  <p className="text-[11px] text-subtle">{t("leads.bulkMessageHint")}</p>
                </div>
              )}
            </div>
          )}

          <ConfirmDialog
            open={confirmDeleteOpen}
            onOpenChange={setConfirmDeleteOpen}
            title={t("leads.bulkDeleteConfirmTitle")}
            description={t("leads.bulkDeleteConfirmDesc", { count: selected.length })}
            confirmLabel={t("leads.bulkDelete")}
            onConfirm={() => void confirmBulkDelete()}
          />

          <div className="-m-4 overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="sticky top-0 z-10 bg-card px-6 py-3">
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
                    <th key={h} className="sticky top-0 z-10 bg-card px-6 py-3 font-medium">
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
