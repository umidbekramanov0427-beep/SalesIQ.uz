import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, GripVertical, Rss } from "lucide-react";
import { toast } from "sonner";
import { TagEditor } from "@/components/crm/tag-editor";
import { FollowUpChip, LeadPhoneChip, TemperatureChip } from "@/components/crm/lead-badges";
import type { PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, stageBorderProps, stageColorProps, stageTintProps } from "@/lib/utils";
import {
  isKanbanCardFieldVisible,
  useAmoCrmLink,
  useOrgGeneralSettings,
  usePermission,
  useUpdateLead,
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

// The solid accent stripe down the column's left edge -- see
// stageBorderProps' own comment for why this carries the "which color is
// this" signal instead of the (still present, but much subtler) tint.
function stageAccent(s: { is_won: boolean; is_lost: boolean; color: string }): {
  className: string;
  style?: CSSProperties;
} {
  if (s.is_won) return { className: "border-l-success" };
  if (s.is_lost) return { className: "border-l-destructive" };
  const accent = stageBorderProps(s.color);
  return accent.className
    ? { className: accent.className }
    : accent.style
      ? { className: "", style: accent.style }
      : { className: "" };
}

export function PipelineBoard({
  funnel,
  leads,
  stages,
  sortBy,
}: {
  funnel: string;
  leads: CrmLeadView[];
  stages: StageRow[];
  // Owned by funnels.tsx (its "..." toolbar now lives in the filter row,
  // not floating above the board) so the sort choice doesn't reset every
  // time the board itself remounts.
  sortBy: PipelineSortBy;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const updateLead = useUpdateLead();
  const getAmoLink = useAmoCrmLink();
  const canMoveDeals = usePermission("Move deals");
  const canViewRevenue = usePermission("View revenue");

  const { data: orgSettings } = useOrgGeneralSettings();
  const showField = (key: KanbanCardFieldKey) => isKanbanCardFieldVisible(orgSettings, key);

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
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max gap-5">
        {visibleStages.map((s) => {
          const ids = board[s.id] ?? [];
          const items = sortItems(ids.map((id) => leads.find((l) => l.id === id)!).filter(Boolean));
          const value = items.reduce((sum, l) => sum + l.expectedRevenue, 0);
          const tint = stageTint(s);
          const accent = stageAccent(s);
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
                "flex w-[85vw] max-w-[300px] shrink-0 flex-col rounded-2xl border border-l-4 p-2 shadow-soft transition-colors sm:w-[300px] sm:p-3",
                over === s.id
                  ? "border-primary/50 bg-mint ring-2 ring-primary/20"
                  : cn(tint.className, accent.className),
              )}
              style={over === s.id ? undefined : { ...tint.style, ...accent.style }}
            >
              <header
                className={cn(
                  "flex items-center justify-between rounded-xl border-b border-border/40 px-2 py-2 sm:px-3 sm:py-2.5",
                  tint.className,
                )}
                style={tint.style}
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5", dot.className)}
                    style={dot.style}
                  />
                  <p className="truncate text-[13px] font-semibold text-foreground sm:text-sm">
                    {s.name}
                  </p>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
                    {items.length}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">
                  {s.probability}%
                </span>
              </header>
              {canViewRevenue && (
                <p className="px-2 py-1.5 text-[11px] font-medium text-subtle sm:py-2 sm:text-xs">
                  {format(value)}
                </p>
              )}

              <div className="space-y-2 sm:space-y-2.5">
                {items.map((l) => {
                  const amoLink = getAmoLink(l.amocrmId);
                  return (
                    <article
                      key={l.id}
                      draggable={canMoveDeals}
                      onDragStart={() => setDragged(l.id)}
                      className={cn(
                        "group relative cursor-grab rounded-lg border border-l-[3px] border-border bg-background p-2 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card active:cursor-grabbing sm:p-2.5",
                        dragged === l.id && "opacity-50",
                        accent.className,
                      )}
                      style={accent.style}
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
                          className="flex min-w-0 items-center gap-1.5 sm:gap-2"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-mint text-[9px] font-semibold text-mint-foreground sm:h-6 sm:w-6 sm:text-[10px]">
                            {l.initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11.5px] font-semibold text-foreground hover:text-primary sm:text-[12.5px]">
                              {l.company || l.name}
                            </span>
                            <span className="block truncate text-[10px] text-subtle sm:text-[11px]">
                              {showField("owner") ? `${l.name} · ${l.owner}` : l.name}
                            </span>
                          </span>
                        </Link>
                        <GripVertical className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>

                      {((showField("temperature") && l.temperature) ||
                        (showField("source") && l.source)) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:mt-2 sm:gap-1.5">
                          {showField("temperature") && l.temperature && (
                            <TemperatureChip temperature={l.temperature} />
                          )}
                          {showField("source") && l.source && (
                            <span className="inline-flex items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:text-[10.5px]">
                              <Rss className="h-2.5 w-2.5 shrink-0" /> {l.source}
                            </span>
                          )}
                        </div>
                      )}

                      {showField("phone") && <LeadPhoneChip phone={l.phone} leadId={l.id} />}

                      {showField("nextFollowUp") && l.nextFollowUp && l.nextFollowUp !== "—" && (
                        <div className="mt-1.5 sm:mt-2">
                          <FollowUpChip label={l.nextFollowUp} iso={l.nextFollowUpIso} />
                        </div>
                      )}

                      {showField("tags") && (
                        <div className="mt-2 sm:mt-2.5">
                          <TagEditor leadId={l.id} tags={l.tags} />
                        </div>
                      )}

                      {canViewRevenue && showField("amount") && (
                        <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 sm:mt-2.5 sm:pt-2">
                          <span className="text-[12px] font-bold text-foreground sm:text-[13px]">
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
  );
}
