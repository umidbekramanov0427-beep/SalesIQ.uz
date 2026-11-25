import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Check, CircleCheck, CircleX } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hintLevelOf, stageHintFor } from "@/lib/stage-hints";
import { KanbanLeadCard } from "@/components/crm/KanbanLeadCard";
import { LeadHoverCard } from "@/components/crm/LeadHoverCard";
import { StageQuickAdd } from "@/components/crm/StageQuickAdd";
import { toast } from "sonner";
import type { PipelineSortBy } from "@/components/crm/KanbanToolbarMenu";
import { sortLikeBoard } from "@/lib/lead-distribution";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, stageColorProps } from "@/lib/utils";
import { LEAD_COLOR_CARD, leadColor, parseLeadColorRules } from "@/lib/lead-colors";
import { missingRequired } from "@/lib/required-fields";
import { requiredLabel } from "@/components/lead/lead-card-layout";
import {
  getLeadCardLayout,
  kanbanCardLayout,
  useAmoCrmLink,
  useBoardChatInfo,
  useLeadCustomFieldDefs,
  useOrgGeneralSettings,
  usePermission,
  useReplyRules,
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
  leading,
  leadingHead,
  showClosed = false,
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
  /** A column drawn before the stages (the missed calls). */
  leading?: ReactNode;
  /** The leading column's head, for the pinned strip of stage names. */
  leadingHead?: ReactNode;
  /**
   * The won / lost stages as columns too (funnels.tsx's «Yopilganlar»).
   * Otherwise, like amoCRM, they have no column and appear as drop zones
   * along the bottom only while a lead is being dragged.
   */
  showClosed?: boolean;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const updateLead = useUpdateLead();
  const getAmoLink = useAmoCrmLink();
  const canMoveDeals = usePermission("Move deals");
  const canCreateDeals = usePermission("Create deals");
  const canViewRevenue = usePermission("View revenue");

  const { data: orgSettings } = useOrgGeneralSettings();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const replyRules = useReplyRules();
  const cardLayout = useMemo(() => getLeadCardLayout(orgSettings), [orgSettings]);
  const layout = useMemo(() => kanbanCardLayout(orgSettings, funnel), [orgSettings, funnel]);
  // The company's colour rules (Voronka sozlamalari -> Lid ranglari).
  const colorRules = useMemo(
    () => parseLeadColorRules(orgSettings?.kanban_card_fields),
    [orgSettings],
  );
  const now = Date.now();
  const cardCtx = useMemo(
    () => ({
      t,
      format,
      canViewRevenue,
      customLabels: Object.fromEntries(fieldDefs.map((d) => [d.key, d.label])),
      customTypes: Object.fromEntries(fieldDefs.map((d) => [d.key, d.field_type])),
      replyLimits: {
        warnMinutes: replyRules.warnMinutes,
        escalateMinutes: replyRules.escalateMinutes,
      },
    }),
    [t, format, canViewRevenue, fieldDefs, replyRules.warnMinutes, replyRules.escalateMinutes],
  );

  const visibleStages = useMemo(
    () => stages.filter((s) => (s.pipeline_name || "Direct Sales") === funnel),
    [stages, funnel],
  );

  const columnStages = useMemo(
    () => (showClosed ? visibleStages : visibleStages.filter((s) => !s.is_won && !s.is_lost)),
    [visibleStages, showClosed],
  );
  const closingStages = useMemo(
    () => visibleStages.filter((s) => s.is_won || s.is_lost),
    [visibleStages],
  );

  // The bar's «O'chirish» zone: super admins only, as in the lead card (the
  // lead goes to the trash, with undo).
  const { user } = useAuth();
  const hintLevel = user
    ? hintLevelOf({ role: user.role, isIntern: user.isIntern, joinedAt: user.joinedAt })
    : "master";

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
    // Majburiy maydonlar must be filled before the lead moves on (closing
    // it as lost doesn't wait for them).
    const target = visibleStages.find((st) => st.id === stageId);
    if (target && !target.is_lost) {
      const missing = missingRequired(cardLayout.required, lead, fieldDefs).filter(
        (k) => !cardLayout.hidden.includes(k),
      );
      if (missing.length) {
        toast.error(
          t("req.blocked", {
            fields: missing.map((k) => requiredLabel(k, cardLayout, fieldDefs, t)).join(", "),
          }),
        );
        return;
      }
    }
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

  // The board gets a selection only in bulk mode, so the boxes show then.
  const selecting = !!selection;

  const sortItems = (items: CrmLeadView[]) => sortLikeBoard(items, sortBy);

  // The board is ONE scroll box, both ways: the stage names are a sticky
  // row inside it, so names and cards move as one piece in any direction
  // (no JS keeping two layers in step, nothing lags behind a fast swipe).
  const panRef = useRef<HTMLDivElement>(null);
  // It fills the rest of the page's scroll box (<main>), so <main> itself
  // never scrolls under it.
  const [boxH, setBoxH] = useState<number | null>(null);
  useEffect(() => {
    const el = panRef.current;
    const main = el?.closest<HTMLElement>("[data-page-root]");
    if (!el || !main) return;
    const fit = () => {
      const top =
        el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      const h = Math.max(320, Math.floor(main.clientHeight - top));
      el.style.height = `${h}px`;
      // Whatever still sticks out below (the page's own bottom padding).
      const over = main.scrollHeight - main.clientHeight;
      const fixed = over > 0 ? Math.max(320, h - over) : h;
      el.style.height = `${fixed}px`;
      setBoxH(fixed);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(main);
    // Anything above it on the page (the pinned toolbar growing a row).
    for (let n: HTMLElement | null = el; n && n !== main; n = n.parentElement)
      for (let sib = n.previousElementSibling; sib; sib = sib.previousElementSibling)
        ro.observe(sib);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  // While the board moves, cards ignore the pointer: no hover window, no
  // "Tez qo'shish" button lighting up in whichever column slides under it.
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markScrolling = () => {
    const el = panRef.current;
    if (!el) return;
    el.dataset["scrolling"] = "";
    if (scrollIdle.current) clearTimeout(scrollIdle.current);
    scrollIdle.current = setTimeout(() => {
      delete el.dataset["scrolling"];
    }, 160);
  };
  // The mini-map's window: which part of the board is on screen, in %.
  const [win, setWin] = useState({ left: 0, width: 100 });
  const syncWin = () => {
    const el = panRef.current;
    if (!el || !el.scrollWidth) return;
    const left = Math.round((el.scrollLeft / el.scrollWidth) * 1000) / 10;
    const width = Math.round(Math.min(1, el.clientWidth / el.scrollWidth) * 1000) / 10;
    setWin((w) => (w.left === left && w.width === width ? w : { left, width }));
  };
  useEffect(() => {
    const el = panRef.current;
    if (!el) return;
    syncWin();
    const ro = new ResizeObserver(syncWin);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  const [mapOn, setMapOn] = useState(false);
  const mapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // true: keep it while the pointer is on it; undefined: a scroll (fades
  // 1.2 s after the last one); false: the pointer left it.
  const showMap = (hold?: boolean) => {
    if (mapTimer.current) clearTimeout(mapTimer.current);
    setMapOn(true);
    if (!hold) mapTimer.current = setTimeout(() => setMapOn(false), hold === false ? 600 : 1200);
  };
  // The lead preview (LeadHoverCard): opens after the pointer rests on a
  // card for half a second, stays while the pointer is on the window.
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterCard = (id: string, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(
      () => setHover({ id, rect: el.getBoundingClientRect() }),
      hover ? 150 : 550,
    );
  };
  const keepHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };
  const leaveHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 250);
  };
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (mapTimer.current) clearTimeout(mapTimer.current);
      if (scrollIdle.current) clearTimeout(scrollIdle.current);
    },
    [],
  );
  const scrollToStage = (id: string) => {
    const el = panRef.current;
    const col = el?.querySelector<HTMLElement>(`[data-stage-col="${id}"]`);
    if (el && col) el.scrollTo({ left: col.offsetLeft - 8, behavior: "smooth" });
  };
  function startPan(e: React.PointerEvent<HTMLDivElement>) {
    const el = panRef.current;
    const target = e.target as HTMLElement;
    // Only an empty spot of the board: never a card, a button or a field.
    if (!el || e.button !== 0 || e.pointerType !== "mouse") return;
    if (target.closest("article, button, a, input, textarea, select, [role=checkbox]")) return;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    const move = (ev: PointerEvent) => {
      el.scrollLeft = startLeft - (ev.clientX - startX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.style.cursor = "";
    };
    el.style.cursor = "grabbing";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const cols = columnStages.map((s) => {
    const ids = board[s.id] ?? [];
    const items = sortItems(
      ids.map((id) => leadsById.get(id)).filter((l): l is CrmLeadView => !!l),
    );
    return {
      s,
      items,
      value: items.reduce((sum, l) => sum + l.expectedRevenue, 0),
      line: stageLine(s),
    };
  });
  // Dropping on a stage's name moves the card there too.
  const dropProps = (id: string) => ({
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: () => void move(id),
  });

  return (
    <div>
      {/* No scrollbar under the board (amoCRM has none): it scrolls sideways
          with a trackpad, Shift + wheel, or by dragging an empty spot.
          overscroll-contain: reaching an edge never hands the swipe to the
          browser (its back/forward gesture) or to the page. */}
      <div
        ref={panRef}
        data-board-scroll
        onPointerDown={startPan}
        onScroll={() => {
          markScrolling();
          syncWin();
          showMap();
        }}
        style={boxH ? { height: boxH } : undefined}
        className="relative cursor-default overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&[data-scrolling]>*]:pointer-events-none"
      >
        {/* The stage names: a solid sticky row INSIDE the scroll box, so
            cards pass under it unseen and it moves with them sideways. */}
        <div
          className={cn(
            "sticky top-0 z-[8] flex min-w-max gap-4 bg-background pt-1.5",
            selection && "pl-1.5",
          )}
        >
          {leadingHead}
          {cols.map(({ s, items, value, line }) => (
            <div
              key={s.id}
              {...dropProps(s.id)}
              className={cn("w-[86vw] max-w-[320px] shrink-0 rounded-xl sm:w-[320px]")}
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
                    className="absolute -left-1.5 -top-1.5 z-10"
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
                {/* The stage's hint for this person's experience level
                    (Voronka sozlamalari, stage-hints.ts). */}
                {stageHintFor(s, hintLevel) && (
                  <p
                    title={stageHintFor(s, hintLevel)}
                    className="mt-1.5 line-clamp-2 rounded-md bg-amber-500/[0.08] px-2 py-1 text-left text-[11.5px] leading-snug text-amber-800 dark:text-amber-200"
                  >
                    {stageHintFor(s, hintLevel)}
                  </p>
                )}
              </header>
            </div>
          ))}
        </div>
        <div className={cn("flex min-w-max gap-4 pb-14 pt-1 phone:pb-4", selection && "pl-1.5")}>
          {leading}
          {cols.map(({ s, items }) => {
            return (
              <section
                key={s.id}
                data-stage-col={s.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void move(s.id)}
                className={cn(
                  // No box per stage: like amoCRM, every column sits on the one
                  // page background, a header with a colored line over its cards.
                  "group/stage flex w-[86vw] max-w-[320px] shrink-0 flex-col rounded-xl sm:w-[320px]",
                )}
              >
                <div className="flex-1 space-y-1.5 pb-2">
                  {canCreateDeals && !selecting && <StageQuickAdd stageId={s.id} funnel={funnel} />}
                  {items.map((l) => {
                    const color = colorRules.length ? leadColor(l, colorRules, funnel, now) : null;
                    return (
                      <article
                        key={l.id}
                        draggable={canMoveDeals}
                        onDragStart={() => {
                          setHover(null);
                          setDragged(l.id);
                        }}
                        onMouseEnter={(e) => !dragged && enterCard(l.id, e.currentTarget)}
                        onMouseLeave={leaveHover}
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
                          color && LEAD_COLOR_CARD[color],
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
                            className="absolute -left-1.5 -top-1.5 z-10"
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
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {/* 5CRM's stage map: grey blocks in the screen's corner, the part on
          screen framed; it shows only while the board is moving sideways
          and fades once it stops. A click scrolls to that stage. */}
      {!dragged &&
        cols.length > 3 &&
        win.width < 100 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-label={t("pipeline.miniMap")}
            onMouseEnter={() => showMap(true)}
            onMouseLeave={() => showMap(false)}
            className={cn(
              "amo-skin fixed bottom-6 right-[92px] z-30 flex h-6 w-[200px] items-stretch gap-[2px] rounded-[3px] p-[2px] transition-opacity duration-300 phone:hidden",
              mapOn ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {cols.map(({ s, items }) => (
              <button
                key={s.id}
                type="button"
                title={`${s.name} · ${items.length}`}
                onClick={() => scrollToStage(s.id)}
                className="min-w-0 flex-1 rounded-[2px] bg-[color-mix(in_oklab,var(--foreground),transparent_82%)] hover:bg-[color-mix(in_oklab,var(--foreground),transparent_65%)]"
              />
            ))}
            <span
              className="pointer-events-none absolute inset-y-0 rounded-[3px] border-2 border-[color-mix(in_oklab,var(--foreground),transparent_45%)]"
              style={{ left: `${win.left}%`, width: `${win.width}%` }}
            />
          </div>,
          document.body,
        )}
      {hover && !dragged && leadsById.get(hover.id) && (
        <LeadHoverCard
          lead={leadsById.get(hover.id)!}
          anchor={hover.rect}
          stages={stages}
          onClose={() => setHover(null)}
          onKeep={keepHover}
          onLeave={leaveHover}
        />
      )}
      {dragged &&
        closingStages.length > 0 &&
        typeof document !== "undefined" &&
        // A portal: an ancestor's transform would pin a fixed bar to the
        // board instead of the bottom of the screen.
        createPortal(
          // amoCRM's closing bar: the won / lost stages as wide drop targets
          // along the bottom of the screen while a card is in the air.
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:fade-in">
            <div className="pointer-events-auto flex w-full max-w-[900px] gap-3 rounded-2xl border border-border bg-card/95 p-2.5 shadow-[0_12px_40px_rgba(15,23,42,0.22)] backdrop-blur">
              {closingStages.map((s) => {
                const won = s.is_won;
                const Icon = won ? CircleCheck : CircleX;
                return (
                  <div
                    key={s.id}
                    role="region"
                    aria-label={s.name}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(s.id);
                    }}
                    onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      void move(s.id);
                    }}
                    className={cn(
                      "flex min-h-[72px] flex-1 items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 transition-[background-color,border-color,transform] duration-150",
                      won
                        ? "border-emerald-500/50 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
                        : "border-rose-500/45 bg-rose-500/[0.07] text-rose-700 dark:text-rose-300",
                      over === s.id &&
                        (won
                          ? "scale-[1.02] border-solid border-emerald-500 bg-emerald-500/[0.18]"
                          : "scale-[1.02] border-solid border-rose-500 bg-rose-500/[0.16]"),
                    )}
                  >
                    <Icon className="h-6 w-6 shrink-0" />
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[14px] font-bold uppercase tracking-[0.04em]">
                        {s.name}
                      </span>
                      <span className="block truncate text-[12px] opacity-75">
                        {t("pipeline.dropToClose")}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
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
