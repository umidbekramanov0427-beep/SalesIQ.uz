import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, stageColorProps } from "@/lib/utils";
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

// amoCRM's task marker in a card's corner: none planned (amber, "no
// tasks"), overdue (red), or upcoming (green).
function followUpState(iso: string | null): "none" | "overdue" | "planned" {
  if (!iso) return "none";
  return new Date(iso).getTime() < Date.now() ? "overdue" : "planned";
}

function shortDate(iso: string, t: (k: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date();
  yest.setDate(now.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (same(d, now)) return `${t("amo.today")} ${time}`;
  if (same(d, yest)) return `${t("amo.yesterday")} ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
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
  const navigate = useNavigate();
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
      <div className="flex min-w-max gap-3">
        {visibleStages.map((s) => {
          const ids = board[s.id] ?? [];
          const items = sortItems(ids.map((id) => leads.find((l) => l.id === id)!).filter(Boolean));
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
              <header className="px-2 pb-2.5 pt-1 text-center">
                <p className="truncate text-[12.5px] font-bold uppercase tracking-wide text-foreground">
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
                {items.map((l) => {
                  const amoLink = getAmoLink(l.amocrmId);
                  const task = followUpState(l.nextFollowUpIso);
                  const chips = [
                    ...(showField("temperature") && l.temperature ? [l.temperature] : []),
                    ...(showField("source") && l.source ? [l.source] : []),
                    ...(showField("tags") ? l.tags : []),
                  ];
                  const person = l.contactName && l.contactName !== l.name ? l.contactName : "";
                  return (
                    <article
                      key={l.id}
                      draggable={canMoveDeals}
                      onDragStart={() => setDragged(l.id)}
                      onDragEnd={() => setDragged(null)}
                      onClick={() =>
                        void navigate({
                          to: "/crm/leads/$leadId",
                          params: { leadId: l.id },
                          search: { from: "funnels" },
                        })
                      }
                      className={cn(
                        "group relative cursor-pointer rounded-[3px] border border-border bg-card px-3 py-2.5 text-[13px] transition-colors hover:border-primary/45",
                        canMoveDeals && "active:cursor-grabbing",
                        dragged === l.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                          {l.initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-foreground/90">
                              {showField("owner") ? l.owner || "—" : ""}
                            </span>
                            <span className="shrink-0 text-[12px] text-subtle">
                              {shortDate(l.createdAtIso, t)}
                            </span>
                          </div>
                          <Link
                            to="/crm/leads/$leadId"
                            params={{ leadId: l.id }}
                            search={{ from: "funnels" }}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate text-[14px] text-primary hover:underline"
                          >
                            {l.company || l.name}
                          </Link>
                          {person && <p className="truncate text-foreground/80">{person}</p>}
                          {showField("phone") && l.phone && (
                            <p className="truncate tabular-nums text-foreground/80">{l.phone}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5 pl-[42px]">
                        {canViewRevenue && showField("amount") && (
                          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                            {format(l.expectedRevenue)}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                          {chips.slice(0, 2).map((c) => (
                            <span
                              key={c}
                              className="max-w-[130px] shrink-0 truncate rounded-[3px] border border-border px-1.5 text-[11px] leading-[18px] text-muted-foreground"
                            >
                              {c}
                            </span>
                          ))}
                          {chips.length > 2 && (
                            <span className="shrink-0 rounded-[3px] border border-border px-1 text-[11px] leading-[18px] text-muted-foreground">
                              +{chips.length - 2}
                            </span>
                          )}
                        </span>
                        {task === "none" && (
                          <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">
                            {t("pipeline.noTasks")}
                          </span>
                        )}
                        <span
                          title={
                            task === "overdue"
                              ? t("pipeline.taskOverdue")
                              : task === "planned"
                                ? t("pipeline.taskPlanned")
                                : t("pipeline.noTasks")
                          }
                          className={cn(
                            "h-[7px] w-[7px] shrink-0 rounded-full",
                            task === "overdue"
                              ? "bg-destructive"
                              : task === "planned"
                                ? "bg-success"
                                : "bg-amber-500",
                          )}
                        />
                      </div>

                      {amoLink && (
                        <a
                          href={amoLink}
                          target="_blank"
                          rel="noreferrer"
                          title={t("leadFilter.openInAmoCrm")}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-2 right-7 hidden text-subtle hover:text-primary group-hover:block"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </article>
                  );
                })}
                {items.length === 0 && dragged && (
                  <p className="rounded-[3px] border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
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
