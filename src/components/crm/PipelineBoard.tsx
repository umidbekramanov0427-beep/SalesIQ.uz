import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { KanbanLeadCard } from "@/components/crm/KanbanLeadCard";
import { toast } from "sonner";
import type { PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, stageColorProps } from "@/lib/utils";
import {
  kanbanCardLayout,
  useAmoCrmLink,
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

  function sortItems(items: CrmLeadView[]): CrmLeadView[] {
    const sorted = [...items];
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
    if (sortBy === "lastMessage") {
      sorted.sort((a, b) => time(b.lastContactIso) - time(a.lastContactIso));
    } else if (sortBy === "lastEvent") {
      sorted.sort((a, b) => time(b.updatedAtIso) - time(a.updatedAtIso));
    } else if (sortBy === "name") {
      sorted.sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
    } else if (sortBy === "amount") {
      sorted.sort((a, b) => (b.budget || b.expectedRevenue) - (a.budget || a.expectedRevenue));
    } else {
      sorted.sort(
        (a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
      );
    }
    return sorted;
  }

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
                "flex w-[85vw] max-w-[296px] shrink-0 flex-col rounded-[3px] sm:w-[296px]",
                over === s.id && "bg-primary/[0.06]",
              )}
            >
              <header className="group/col relative px-2 pb-2.5 pt-1 text-center">
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
                    className="absolute left-1.5 top-1.5 group-hover/col:opacity-100"
                  />
                )}
                <p className="truncate px-5 text-[12.5px] font-bold uppercase tracking-wide text-foreground">
                  {s.name}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {t("pipeline.columnCount", { count: items.length })}
                  {canViewRevenue && (
                    <>
                      : <span className="tabular-nums text-foreground/80">{format(value)}</span>
                    </>
                  )}
                </p>
              </header>
              <span className={cn("mb-2 h-[3px] w-full", line.className)} style={line.style} />

              <div className="space-y-[6px]">
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
                      "group relative cursor-pointer rounded-xl border border-border bg-card p-3 text-[13px] transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_2px_10px_rgba(16,24,40,0.07)]",
                      canMoveDeals && "active:cursor-grabbing",
                      dragged === l.id && "opacity-40",
                      selection?.ids.has(l.id) &&
                        "border-primary/60 bg-primary/[0.05] ring-1 ring-primary/30",
                    )}
                  >
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
                      lead={l}
                      layout={layout}
                      ctx={cardCtx}
                      amoLink={getAmoLink(l.amocrmId)}
                    />
                    {l.repeatCount > 0 && (
                      <span
                        title={t("guard.repeatHint")}
                        className="absolute right-2 top-2 rounded-full bg-amber-500/15 px-1.5 py-px text-[10.5px] font-bold tabular-nums text-amber-700 dark:text-amber-400"
                      >
                        ×{l.repeatCount + 1}
                      </span>
                    )}
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
