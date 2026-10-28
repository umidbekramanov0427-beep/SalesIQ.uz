import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { KanbanLeadCard } from "@/components/crm/KanbanLeadCard";
import { toast } from "sonner";
import type { PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { sortLikeBoard } from "@/lib/lead-distribution";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, stageColorProps } from "@/lib/utils";
import {
  kanbanCardLayout,
  useAmoCrmLink,
  useBoardChatInfo,
  useLeadCustomFieldDefs,
  useOrgGeneralSettings,
  usePermission,
  useUpdateLead,
  type CrmLeadView,
  type StageRow,
} from "@/hooks/use-crm-data";
import { useTaskGuardedMove } from "@/components/crm/RequiredTaskDialog";

// The AmoCRM drag-and-drop Kanban board -- previously the whole /crm/pipeline
// page, now embedded as one of Funnels' two lead views (the other being
// the list). Takes the funnel's already-filtered lead set (the same one the
// list renders) plus the full stage list, and renders only the columns
// belonging to this funnel.
//
// The colour line under a column header -- the one place a stage's colour
// shows on this board, like amoCRM's.
function stageLine(s: { is_won: boolean; is_lost: boolean; color: string }): {
  className?: string;
  style?: CSSProperties;
} {
  if (s.is_won) return { className: "bg-success" };
  if (s.is_lost) return { className: "bg-destructive" };
  return stageColorProps(s.color);
}

export function PipelineBoard({
  funnel,
  leads,
  stages,
  sortBy,
  selection,
  liveIds,
}: {
  funnel: string;
  leads: CrmLeadView[];
  stages: StageRow[];
  // Owned by funnels.tsx (its "..." toolbar now lives in the filter row,
  // not floating above the board) so the sort choice doesn't reset every
  // time the board itself remounts.
  sortBy: PipelineSortBy;
  // amoCRM's mass actions: a tick on every card (shown on hover, always
  // once something is ticked) and one per column header for all of it.
  // While anything is ticked, clicking a card ticks it instead of opening.
  selection?: {
    ids: Set<string>;
    onToggle: (id: string) => void;
    onSetMany: (ids: string[], on: boolean) => void;
  };
  /** Leads whose client is going through a salesbot right now (registering). */
  liveIds?: Set<string>;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const updateLead = useUpdateLead();
  const getAmoLink = useAmoCrmLink();
  const canMoveDeals = usePermission("Move deals");
  const canViewRevenue = usePermission("View revenue");

  const { data: orgSettings } = useOrgGeneralSettings();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const layout = useMemo(() => kanbanCardLayout(orgSettings, funnel), [orgSettings, funnel]);
  const cardCtx = useMemo(
    () => ({
      t,
      format,
      canViewRevenue,
      customLabels: Object.fromEntries(fieldDefs.map((d) => [d.key, d.label])),
      customTypes: Object.fromEntries(fieldDefs.map((d) => [d.key, d.field_type])),
    }),
    [t, format, canViewRevenue, fieldDefs],
  );

  const visibleStages = useMemo(
    () => stages.filter((s) => (s.pipeline_name || "Direct Sales") === funnel),
    [stages, funnel],
  );

  const [board, setBoard] = useState<Record<string, string[]>>({});
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  // Latest chat message per lead (the bubble) and the clients' photos.
  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const chatInfo = useBoardChatInfo(leadIds).data;

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const s of visibleStages)
      next[s.id] = leads.filter((l) => l.stageId === s.id).map((l) => l.id);
    setBoard(next);
  }, [visibleStages, leads]);

  const { guardMove, dialog: taskDialog } = useTaskGuardedMove();

  async function move(stageId: string) {
    if (!dragged || !canMoveDeals) return;
    const leadId = dragged;
    setDragged(null);
    setOver(null);
    const lead = leadsById.get(leadId);
    if (!lead || lead.stageId === stageId) return;
    // The card lands in the new column at once (useUpdateLead patches the
    // board's data before the request); a stage that needs a task or note
    // is refused by the database, the card goes back and the dialog opens.
    await guardMove(
      { id: leadId, name: lead.name, ownerId: lead.ownerId },
      stageId,
      async () => {
        setBoard((b) => {
          const next: Record<string, string[]> = {};
          for (const k of Object.keys(b)) next[k] = (b[k] ?? []).filter((id) => id !== leadId);
          next[stageId] = [leadId, ...(next[stageId] ?? [])];
          return next;
        });
        await updateLead.mutateAsync({ id: leadId, patch: { stage_id: stageId } });
      },
      t("pipeline.moveFailed"),
      { optimistic: true },
    );
  }

  const selecting = !!selection && selection.ids.size > 0;

  const sortItems = (items: CrmLeadView[]) => sortLikeBoard(items, sortBy);

  return (
    <div className="overflow-x-auto pb-4">
      <div className={cn("flex min-w-max gap-4", selection && "pl-1.5")}>
        {visibleStages.map((s) => {
          const ids = board[s.id] ?? [];
          const items = sortItems(
            ids.map((id) => leadsById.get(id)).filter((l): l is CrmLeadView => !!l),
          );
          const value = items.reduce((sum, l) => sum + l.expectedRevenue, 0);
          const line = stageLine(s);
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
                // No box per stage: like amoCRM, every column sits on the one
                // page background, a header with a colored line over its cards.
                "flex w-[86vw] max-w-[290px] shrink-0 flex-col rounded-xl transition-colors sm:w-[290px]",
                over === s.id && "bg-primary/[0.06] ring-1 ring-primary/30",
              )}
            >
              <header className="group/col relative px-1 pb-2 pt-1 text-center">
                {selection && items.length > 0 && (
                  <Tick
                    checked={items.every((l) => selection.ids.has(l.id))}
                    visible={selecting}
                    label={t("bulk.selectColumn")}
                    onClick={() =>
                      selection.onSetMany(
                        items.map((l) => l.id),
                        !items.every((l) => selection.ids.has(l.id)),
                      )
                    }
                    className="absolute -left-1.5 -top-1.5 z-10 group-hover/col:opacity-100"
                  />
                )}
                <h2 className="truncate text-[13px] font-bold uppercase tracking-[0.04em] text-foreground">
                  {s.name}
                </h2>
                <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                  {canViewRevenue
                    ? t("pipeline.colSummary", { n: items.length, sum: format(value) })
                    : t("pipeline.colCount", { n: items.length })}
                </p>
                <span
                  className={cn("mt-2 block h-[2px] rounded-full", line.className)}
                  style={line.style}
                />
              </header>

              <div className="flex-1 space-y-1.5 pb-2">
                {items.map((l) => (
                  <article
                    key={l.id}
                    draggable={canMoveDeals}
                    onDragStart={() => setDragged(l.id)}
                    onDragEnd={() => setDragged(null)}
                    onClick={() =>
                      selecting && selection
                        ? selection.onToggle(l.id)
                        : void navigate({
                            to: "/crm/leads/$leadId",
                            params: { leadId: l.id },
                            search: { from: "funnels" },
                          })
                    }
                    className={cn(
                      "group relative cursor-pointer rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] shadow-[0_1px_1px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_2px_8px_rgba(16,24,40,0.08)] dark:border-white/[0.1] dark:bg-[color-mix(in_oklab,var(--card),white_5%)]",
                      canMoveDeals && "active:cursor-grabbing",
                      dragged === l.id && "opacity-40",
                      selection?.ids.has(l.id) &&
                        "border-primary/60 bg-primary/[0.05] ring-1 ring-primary/30",
                      liveIds?.has(l.id) &&
                        "border-emerald-500/70 ring-2 ring-emerald-500/25 dark:border-emerald-400/60",
                    )}
                  >
                    {liveIds?.has(l.id) && (
                      <span className="absolute -top-2.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10.5px] font-bold text-white shadow-sm">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
                        {t("live.registering")}
                      </span>
                    )}
                    {selection && (
                      <Tick
                        checked={selection.ids.has(l.id)}
                        visible={selecting}
                        label={t("bulk.selectLead")}
                        onClick={() => selection.onToggle(l.id)}
                        className="absolute -left-1.5 -top-1.5 z-10 group-hover:opacity-100"
                      />
                    )}
                    <KanbanLeadCard
                      lead={{ ...l, leadNumber: chatInfo?.numbers.get(l.id) ?? null }}
                      layout={layout}
                      ctx={cardCtx}
                      amoLink={getAmoLink(l.amocrmId)}
                      chat={{
                        last: chatInfo?.last.get(l.id) ?? null,
                        hasPhoto: !!chatInfo?.photos.has(l.id),
                      }}
                    />
                  </article>
                ))}
                {items.length === 0 && dragged && (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
                    {t("pipeline.dropHint")}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {taskDialog}
    </div>
  );
}

function Tick({
  checked,
  visible,
  label,
  onClick,
  className,
}: {
  checked: boolean;
  visible: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid h-5 w-5 place-items-center rounded-md border shadow-sm transition-[opacity,background-color]",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-transparent hover:border-primary",
        visible || checked ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}
