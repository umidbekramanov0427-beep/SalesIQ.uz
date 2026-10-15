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
// page, now embedded as one of Funnels' 3 lead views (the other two being
// list and gallery, in LeadFilterBar). Takes the funnel's already-filtered
// lead set (same one the list/gallery views render) plus the full stage
// list, and renders only the columns belonging to this funnel.
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
      <div className={cn("flex min-w-max gap-3", selection && "pl-1.5")}>
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
                "flex w-[88vw] max-w-[352px] shrink-0 flex-col rounded-2xl border border-border bg-card/60 transition-colors dark:bg-white/[0.035] sm:w-[352px]",
                over === s.id && "border-primary/40 bg-primary/[0.06]",
              )}
            >
              <header className="group/col relative px-3.5 pb-2.5 pt-3">
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
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", line.className)}
                    style={line.style}
                  />
                  <h2 className="min-w-0 flex-1 truncate text-[13px] font-extrabold uppercase tracking-wide text-foreground">
                    {s.name}
                  </h2>
                  <span className="min-w-[28px] rounded-full bg-foreground/[0.08] px-2 py-0.5 text-center text-[12px] font-extrabold tabular-nums text-foreground">
                    {items.length}
                  </span>
                </div>
                {canViewRevenue && (
                  <p className="mt-1 pl-[18px] text-[12.5px] font-bold tabular-nums text-muted-foreground">
                    {format(value)}
                  </p>
                )}
              </header>
              <span
                className={cn("mx-3.5 mb-3 h-[3px] rounded-full", line.className)}
                style={line.style}
              />

              <div className="flex-1 space-y-2 px-2.5 pb-2.5">
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
                      "group relative cursor-pointer rounded-xl border border-border bg-card p-3 text-[13px] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_2px_10px_rgba(16,24,40,0.08)] dark:border-white/[0.08] dark:bg-[color-mix(in_oklab,var(--card),black_18%)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
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
