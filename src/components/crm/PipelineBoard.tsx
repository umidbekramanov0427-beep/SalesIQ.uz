import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import {
  Copy,
  Download,
  ExternalLink,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Rss,
  Settings2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { TagEditor } from "@/components/crm/tag-editor";
import { Pill } from "@/components/layout/Primitives";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/export-csv";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, stageColorProps, stageTintProps } from "@/lib/utils";
import {
  isKanbanCardFieldVisible,
  KANBAN_CARD_FIELD_KEYS,
  useAmoCrmLink,
  useOrgGeneralSettings,
  usePermission,
  useUpdateLead,
  useUpdateOrgGeneralSettings,
  type CrmLeadView,
  type KanbanCardFieldKey,
  type StageRow,
} from "@/hooks/use-crm-data";

// The AmoCRM drag-and-drop Kanban board -- previously the whole /crm/pipeline
// page, now embedded as one of Funnels' 3 lead views (the other two being
// list and gallery, in LeadFilterBar). Takes the funnel's already-filtered
// lead set (same one the list/gallery views render) plus the full stage
// list, and renders only the columns belonging to this funnel.
//
// Reuses stageTintProps (the same ~10%-opacity tint admin.pipelines.tsx's
// settings rows use) instead of the near-invisible 4% this board used to
// mix by hand -- that one only recognized hex colors and left every
// Tailwind-class stage (i.e. every hand-created, non-AmoCRM-synced stage)
// essentially untinted, which is why only one column visibly had "a color"
// and the rest all read as plain gray.
function stageTint(s: { is_won: boolean; is_lost: boolean; color: string }): {
  className: string;
  style?: CSSProperties;
} {
  if (s.is_won) return { className: "bg-success/10 border-success/30" };
  if (s.is_lost) return { className: "bg-destructive/10 border-destructive/30" };
  const tint = stageTintProps(s.color);
  const className = tint.className ? `${tint.className} border-border` : "border-border";
  return tint.style ? { className, style: tint.style } : { className };
}

const tempTone = (t: string): "danger" | "warning" | "info" =>
  t === "Hot" ? "danger" : t === "Warm" ? "warning" : "info";

type SortBy = "created" | "name" | "amount";

export function PipelineBoard({
  funnel,
  leads,
  stages,
  autoRefresh,
  onAutoRefreshChange,
}: {
  funnel: string;
  leads: CrmLeadView[];
  stages: StageRow[];
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const updateLead = useUpdateLead();
  const getAmoLink = useAmoCrmLink();
  const canMoveDeals = usePermission("Move deals");
  const canViewRevenue = usePermission("View revenue");

  const { data: orgSettings } = useOrgGeneralSettings();
  const updateOrgSettings = useUpdateOrgGeneralSettings();
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const showField = (key: KanbanCardFieldKey) => isKanbanCardFieldVisible(orgSettings, key);

  async function toggleCardField(key: KanbanCardFieldKey, value: boolean) {
    const current = (orgSettings?.kanban_card_fields as Record<string, boolean> | null) ?? {};
    try {
      await updateOrgSettings.mutateAsync({
        kanban_card_fields: { ...current, [key]: value },
      });
    } catch (err) {
      toast.error(describeError(err, t("pipeline.cardFieldsSaveFailed")));
    }
  }

  const [sortBy, setSortBy] = useState<SortBy>("created");

  const visibleStages = useMemo(
    () => stages.filter((s) => (s.pipeline_name || "Direct Sales") === funnel),
    [stages, funnel],
  );

  const [board, setBoard] = useState<Record<string, string[]>>({});
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const s of visibleStages)
      next[s.id] = leads.filter((l) => l.stageId === s.id).map((l) => l.id);
    setBoard(next);
  }, [visibleStages, leads]);

  async function move(stageId: string) {
    if (!dragged || !canMoveDeals) return;
    const leadId = dragged;
    const previousBoard = board;
    setBoard((b) => {
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(b)) next[k] = (b[k] ?? []).filter((id) => id !== leadId);
      next[stageId] = [leadId, ...(next[stageId] ?? [])];
      return next;
    });
    setDragged(null);
    setOver(null);
    try {
      await updateLead.mutateAsync({ id: leadId, patch: { stage_id: stageId } });
    } catch (err) {
      // Optimistic move failed server-side (RLS denial, network blip) --
      // used to just silently leave the card parked in the new column
      // forever with no error and no way to tell the move never persisted.
      setBoard(previousBoard);
      toast.error(err instanceof Error ? err.message : t("pipeline.moveFailed"));
    }
  }

  function sortItems(items: CrmLeadView[]): CrmLeadView[] {
    const sorted = [...items];
    if (sortBy === "name") {
      sorted.sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
    } else if (sortBy === "amount") {
      sorted.sort((a, b) => b.expectedRevenue - a.expectedRevenue);
    } else {
      sorted.sort(
        (a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
      );
    }
    return sorted;
  }

  return (
    <>
      {/* AmoCRM shows this same set (card fields, sort order, auto-refresh,
          plus links out to Import/Export/duplicate search/bulk actions)
          behind a single "..." menu sitting right above the board itself
          -- kept here rather than in the page-level filter bar since none
          of it applies to the list/gallery views. */}
      <div className="mb-3 flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("pipeline.toolbar.more")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setCardDialogOpen(true)}>
              <Settings2 className="h-4 w-4" /> {t("pipeline.cardAppearance.title")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("pipeline.toolbar.sortBy")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <DropdownMenuRadioItem value="created">
                {t("pipeline.toolbar.sortCreated")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">
                {t("pipeline.toolbar.sortName")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="amount">
                {t("pipeline.toolbar.sortAmount")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={autoRefresh}
              onCheckedChange={(v) => onAutoRefreshChange(!!v)}
            >
              <RefreshCw className="h-4 w-4" /> {t("pipeline.toolbar.autoRefresh")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/onboarding/data-import">
                <Upload className="h-4 w-4" /> {t("pipeline.toolbar.import")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                downloadCsv(
                  funnel,
                  leads.map((l) => ({
                    [t("pipeline.export.name")]: l.name,
                    [t("pipeline.export.company")]: l.company,
                    [t("pipeline.export.phone")]: l.phone,
                    [t("pipeline.export.stage")]: l.stage,
                    [t("pipeline.export.owner")]: l.owner,
                    [t("pipeline.export.amount")]: l.expectedRevenue,
                    [t("pipeline.export.source")]: l.source,
                  })),
                )
              }
            >
              <Download className="h-4 w-4" /> {t("pipeline.toolbar.export")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/admin/duplicates">
                <Copy className="h-4 w-4" /> {t("pipeline.toolbar.findDuplicates")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/crm/leads">
                <ListChecks className="h-4 w-4" /> {t("pipeline.toolbar.bulkActions")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> {t("pipeline.cardAppearance.title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("pipeline.cardAppearance.desc")}</p>
          <ul className="space-y-1">
            {KANBAN_CARD_FIELD_KEYS.map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent">
                  <Checkbox
                    checked={showField(key)}
                    onCheckedChange={(v) => void toggleCardField(key, !!v)}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {t(`pipeline.cardField.${key}`)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-5">
          {visibleStages.map((s) => {
            const ids = board[s.id] ?? [];
            const items = sortItems(
              ids.map((id) => leads.find((l) => l.id === id)!).filter(Boolean),
            );
            const value = items.reduce((sum, l) => sum + l.expectedRevenue, 0);
            const tint = stageTint(s);
            const dot = stageColorProps(s.color);
            return (
              <section
                key={s.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(s.id);
                }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={() => void move(s.id)}
                className={cn(
                  "flex w-[300px] shrink-0 flex-col rounded-2xl border p-3 shadow-soft transition-colors",
                  over === s.id
                    ? "border-primary/50 bg-mint ring-2 ring-primary/20"
                    : tint.className,
                )}
                style={over === s.id ? undefined : tint.style}
              >
                <header
                  className={cn(
                    "flex items-center justify-between rounded-xl border-b border-border/40 px-3 py-2.5",
                    tint.className,
                  )}
                  style={tint.style}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("h-2.5 w-2.5 rounded-full", dot.className)}
                      style={dot.style}
                    />
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {s.probability}%
                  </span>
                </header>
                {canViewRevenue && (
                  <p className="px-2 py-2 text-xs font-medium text-subtle">{format(value)}</p>
                )}

                <div className="space-y-2.5">
                  {items.map((l) => {
                    const amoLink = getAmoLink(l.amocrmId);
                    return (
                      <article
                        key={l.id}
                        draggable={canMoveDeals}
                        onDragStart={() => setDragged(l.id)}
                        className={cn(
                          "group relative cursor-grab rounded-xl border border-border bg-background p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card active:cursor-grabbing",
                          dragged === l.id && "opacity-50",
                        )}
                      >
                        {amoLink && (
                          <a
                            href={amoLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-foreground/90 px-1.5 py-0.5 text-[10px] font-bold text-background hover:opacity-80"
                          >
                            {t("leadFilter.openInAmoCrm")} <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to="/crm/leads/$leadId"
                            params={{ leadId: l.id }}
                            search={{ from: "funnels" }}
                            className="flex min-w-0 items-center gap-2"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint text-[11px] font-semibold text-mint-foreground">
                              {l.initials}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground hover:text-primary">
                                {l.company || l.name}
                              </span>
                              <span className="block truncate text-xs text-subtle">
                                {showField("owner") ? `${l.name} · ${l.owner}` : l.name}
                              </span>
                            </span>
                          </Link>
                          <GripVertical className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>

                        {((showField("phone") && l.phone) ||
                          (showField("temperature") && l.temperature)) && (
                          <div className="mt-1.5 flex items-center gap-2">
                            {showField("phone") && l.phone && (
                              <span className="flex min-w-0 items-center gap-1 truncate text-xs text-subtle">
                                <Phone className="h-3 w-3 shrink-0" /> {l.phone}
                              </span>
                            )}
                            {showField("temperature") && l.temperature && (
                              <Pill tone={tempTone(l.temperature)}>{l.temperature}</Pill>
                            )}
                          </div>
                        )}

                        {showField("source") && l.source && (
                          <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-subtle">
                            <Rss className="h-3 w-3 shrink-0" /> {l.source}
                          </div>
                        )}

                        {showField("nextFollowUp") && l.nextFollowUp && (
                          <div className="mt-1.5 truncate text-xs text-subtle">
                            {t("pipeline.cardField.nextFollowUp")}: {l.nextFollowUp}
                          </div>
                        )}

                        {showField("tags") && (
                          <div className="mt-2.5">
                            <TagEditor leadId={l.id} tags={l.tags} />
                          </div>
                        )}

                        {canViewRevenue && showField("amount") && (
                          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                            <span className="text-sm font-semibold text-foreground">
                              {format(l.expectedRevenue)}
                            </span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
                      {t("pipeline.dropHint")}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
