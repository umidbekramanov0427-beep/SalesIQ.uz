import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GripVertical,
  LayoutDashboard,
  Plus,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Bosh sahifa as a board each person arranges for themselves: the overview's
// blocks are widgets on a 12-column grid. "Panelni sozlash" lets you pick a
// widget up and drop it elsewhere (the others slide out of the way and it
// snaps into its slot), drag its corner to make it wider or narrower (it
// snaps to the sizes that suit it), and add or remove widgets from the
// list on the right. The layout is kept per person in this browser, like
// the cards' own settings (lib/home-card-settings.ts).

export type Span = 3 | 4 | 6 | 8 | 12;
const SPAN_LABEL: Record<Span, string> = { 3: "1/4", 4: "1/3", 6: "1/2", 8: "2/3", 12: "1/1" };

export type BoardWidget = {
  id: string;
  title: string;
  icon: LucideIcon;
  tone: CardTone;
  /** The widths this widget reads well at (12 columns = the full row). */
  sizes: Span[];
  node: ReactNode;
};

export type BoardLayout = { order: string[]; size: Record<string, Span> };

// ---- the saved layout ---------------------------------------------------------

const listeners = new Set<() => void>();
const cache = new Map<string, BoardLayout | null>();

function readLayout(key: string): BoardLayout | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  let v: BoardLayout | null = null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw) as Partial<BoardLayout>;
      if (Array.isArray(p.order)) v = { order: p.order.map(String), size: p.size ?? {} };
    }
  } catch {
    v = null;
  }
  cache.set(key, v);
  return v;
}

function writeLayout(key: string, v: BoardLayout | null) {
  cache.set(key, v);
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode or full storage: the layout still applies until reload.
  }
  for (const l of listeners) l();
}

function useSavedLayout(key: string | null): BoardLayout | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (key ? readLayout(key) : null),
    () => null,
  );
}

/**
 * A saved layout cleaned against today's widgets: a widget that was split
 * into several (`aliases`, e.g. the old KPI row into one card each) is
 * replaced in place by its parts, unknown ids are dropped, and sizes are
 * snapped (a missing one takes the default's, else the widest).
 */
export function cleanLayout(
  layout: BoardLayout,
  byId: Map<string, { sizes: Span[] }>,
  defaults?: BoardLayout,
  aliases: Record<string, string[]> = {},
): BoardLayout {
  const expanded = layout.order.flatMap((id) => aliases[id] ?? [id]);
  const order = [...new Set(expanded)].filter((id) => byId.has(id));
  const size: Record<string, Span> = {};
  for (const id of order) {
    const w = byId.get(id)!;
    const s = layout.size[id];
    const d = defaults?.size[id];
    size[id] =
      s && w.sizes.includes(s) ? s : d && w.sizes.includes(d) ? d : w.sizes[w.sizes.length - 1]!;
  }
  return { order, size };
}

const nearest = (sizes: Span[], want: number): Span =>
  sizes.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));

// ---- the board ------------------------------------------------------------------

type Drag = {
  id: string;
  /** Where the pointer is and where on the card it took hold. */
  x: number;
  y: number;
  offX: number;
  offY: number;
  w: number;
  h: number;
  /** Picked up from the list on the right (dropping it off the board takes it back). */
  fromLibrary: boolean;
};

const NO_ALIASES: Record<string, string[]> = {};

export function HomeBoard({
  widgets,
  defaults,
  editing,
  onEditingChange,
  aliases = NO_ALIASES,
  boardKey = "home",
}: {
  /** Whose layout this is (each page keeps its own, per person). */
  boardKey?: string;
  widgets: BoardWidget[];
  defaults: BoardLayout;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  /** Old widget ids that are now several widgets (old saved layouts keep their place). */
  aliases?: Record<string, string[]>;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const storeKey = user ? `salesiq.${boardKey}.board.v1.${user.id}` : null;
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const saved = useSavedLayout(storeKey);
  const base = useMemo(
    () => cleanLayout(saved ?? defaults, byId, defaults, aliases),
    [saved, defaults, byId, aliases],
  );
  const [draft, setDraft] = useState<BoardLayout | null>(null);
  const layout = editing && draft ? draft : base;

  // Entering the editor starts a draft from what is on screen; leaving drops it.
  useEffect(() => {
    setDraft(editing ? base : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const lockUntil = useRef(0);

  // FLIP: every card that moved slides from where it was to its new slot.
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    itemRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const was = prevRects.current.get(id);
      if (!was || id === dragRef.current?.id) return;
      const dx = was.left - r.left;
      const dy = was.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 260,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    });
    prevRects.current = next;
  }, [layout]);

  const move = useCallback((id: string, to: number) => {
    setDraft((d) => {
      if (!d) return d;
      const order = d.order.filter((x) => x !== id);
      order.splice(Math.max(0, Math.min(to, order.length)), 0, id);
      return order.join() === d.order.join() ? d : { ...d, order };
    });
  }, []);

  const add = useCallback(
    (id: string, at?: number) => {
      const w = byId.get(id);
      if (!w) return;
      setDraft((d) => {
        if (!d || d.order.includes(id)) return d;
        const order = [...d.order];
        order.splice(at ?? order.length, 0, id);
        return { order, size: { ...d.size, [id]: w.sizes[w.sizes.length - 1]! } };
      });
    },
    [byId],
  );
  const remove = useCallback((id: string) => {
    setDraft((d) => (d ? { ...d, order: d.order.filter((x) => x !== id) } : d));
  }, []);
  const resize = useCallback((id: string, span: Span) => {
    setDraft((d) => (d && d.size[id] !== span ? { ...d, size: { ...d.size, [id]: span } } : d));
  }, []);

  // While dragging: follow the pointer, and when it is over another card,
  // take that card's place (a short lock lets the slide finish first).
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag({ ...d, x: e.clientX, y: e.clientY });
      if (performance.now() < lockUntil.current) return;
      const grid = gridRef.current?.getBoundingClientRect();
      const overGrid =
        !!grid &&
        e.clientX >= grid.left &&
        e.clientX <= grid.right &&
        e.clientY >= grid.top - 40 &&
        e.clientY <= grid.bottom + 120;
      setDraft((cur) => {
        if (!cur) return cur;
        if (d.fromLibrary && !overGrid) {
          return cur.order.includes(d.id)
            ? { ...cur, order: cur.order.filter((x) => x !== d.id) }
            : cur;
        }
        if (!overGrid) return cur;
        let order = cur.order.includes(d.id) ? cur.order : [...cur.order, d.id];
        const size =
          cur.size[d.id] || !byId.get(d.id)
            ? cur.size
            : { ...cur.size, [d.id]: byId.get(d.id)!.sizes.at(-1)! };
        for (const [i, oid] of order.entries()) {
          if (oid === d.id) continue;
          const r = itemRefs.current.get(oid)?.getBoundingClientRect();
          if (!r) continue;
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            continue;
          const without = order.filter((x) => x !== d.id);
          const at = without.indexOf(oid);
          const after = order.indexOf(d.id) < i;
          without.splice(after ? at + 1 : at, 0, d.id);
          order = without;
          lockUntil.current = performance.now() + 220;
          break;
        }
        // Below the last card: to the end.
        const lastId = order.filter((x) => x !== d.id).at(-1);
        const last = lastId ? itemRefs.current.get(lastId)?.getBoundingClientRect() : null;
        if (last && e.clientY > last.bottom) order = [...order.filter((x) => x !== d.id), d.id];
        return order.join() === cur.order.join() && size === cur.size ? cur : { order, size };
      });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
    };
    // Re-bound only when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, byId]);

  const pickUp = (id: string, e: ReactPointerEvent, fromLibrary = false) => {
    if (e.button !== 0) return;
    const el = itemRefs.current.get(id);
    const r = el?.getBoundingClientRect();
    e.preventDefault();
    setDrag({
      id,
      x: e.clientX,
      y: e.clientY,
      offX: r ? e.clientX - r.left : 24,
      offY: r ? e.clientY - r.top : 24,
      w: r ? r.width : 280,
      h: r ? Math.min(r.height, 220) : 96,
      fromLibrary,
    });
  };

  // Drag the corner: the width follows the pointer and snaps to the
  // widget's sizes, column by column.
  const startResize = (id: string, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current?.getBoundingClientRect();
    const el = itemRefs.current.get(id)?.getBoundingClientRect();
    const w = byId.get(id);
    if (!grid || !el || !w) return;
    const gap = 14;
    const col = (grid.width - gap * 11) / 12;
    const onMove = (ev: PointerEvent) => {
      const cols = (ev.clientX - el.left + gap) / (col + gap);
      resize(id, nearest(w.sizes, cols));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "ew-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const save = () => {
    if (storeKey && draft) writeLayout(storeKey, draft);
    onEditingChange(false);
  };
  const reset = () => setDraft(cleanLayout(defaults, byId, defaults, aliases));
  const hidden = widgets.filter((w) => !layout.order.includes(w.id));
  const dragged = drag ? byId.get(drag.id) : null;

  const board = (
    <div
      ref={gridRef}
      className={cn(
        "grid grid-cols-12 gap-3.5 [grid-auto-flow:row_dense] phone:grid-cols-1",
        editing && "min-h-[240px] rounded-[20px] p-1",
      )}
    >
      {layout.order.map((id, i) => {
        const w = byId.get(id)!;
        const span = layout.size[id] ?? w.sizes.at(-1)!;
        const isDragged = drag?.id === id;
        const Icon = w.icon;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) itemRefs.current.set(id, el);
              else itemRefs.current.delete(id);
            }}
            data-widget={id}
            style={{ "--span": span } as CSSProperties}
            className={cn(
              "relative min-w-0 [grid-column:span_var(--span)/span_var(--span)] phone:[grid-column:1/-1]",
              editing && "rounded-[var(--radius)]",
            )}
          >
            {editing && (
              <>
                {/* The card's handle: its name, size, move and remove. */}
                <div
                  onPointerDown={(e) => pickUp(id, e)}
                  className={cn(
                    "absolute inset-x-0 top-0 z-30 flex cursor-grab items-center gap-2 rounded-t-[var(--radius)] border-b border-primary/25 bg-card/95 px-2.5 py-2 backdrop-blur active:cursor-grabbing",
                    isDragged && "opacity-0",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-subtle" />
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-md",
                      TONE_TILE[w.tone],
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                    {w.title}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-0.5"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {w.sizes.length > 1 &&
                      w.sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => resize(id, s)}
                          aria-pressed={span === s}
                          aria-label={t("board.width", { size: SPAN_LABEL[s] })}
                          className={cn(
                            "h-6 min-w-6 rounded-md px-1.5 font-mono text-[11px] transition-colors",
                            span === s
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          {SPAN_LABEL[s]}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => move(id, i - 1)}
                      disabled={i === 0}
                      aria-label={t("board.moveBack")}
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(id, i + 1)}
                      disabled={i === layout.order.length - 1}
                      aria-label={t("board.moveOn")}
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(id)}
                      aria-label={t("board.remove", { name: w.title })}
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                {/* Over the content: grab anywhere, nothing inside reacts. */}
                <div
                  onPointerDown={(e) => pickUp(id, e)}
                  className={cn(
                    "absolute inset-0 z-20 cursor-grab rounded-[var(--radius)] ring-1 ring-primary/30 transition-[background-color,box-shadow] hover:bg-primary/[0.03] hover:ring-primary/60 active:cursor-grabbing",
                    isDragged &&
                      "bg-primary/[0.06] outline-2 outline-dashed -outline-offset-2 outline-primary/70 [background-image:repeating-linear-gradient(135deg,transparent_0_10px,color-mix(in_oklab,var(--primary)_8%,transparent)_10px_20px)]",
                  )}
                />
                {w.sizes.length > 1 && (
                  <div
                    onPointerDown={(e) => startResize(id, e)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t("board.resize")}
                    className="absolute bottom-1.5 right-1.5 z-30 grid h-6 w-6 cursor-ew-resize place-items-center rounded-md bg-card text-subtle shadow ring-1 ring-border hover:text-primary hover:ring-primary/50"
                  >
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                      <path
                        d="M11 4 L4 11 M11 8 L8 11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}
              </>
            )}
            <div
              className={cn(
                editing && "pointer-events-none select-none",
                editing && "pt-10",
                isDragged && "opacity-25",
              )}
            >
              {w.node}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!editing) return board;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_268px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.05] px-4 py-3">
          <p className="flex items-center gap-2 text-[13.5px] text-foreground">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            {t("board.hint")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg ctl-soft px-3 text-[13px] font-semibold text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("board.reset")}
            </button>
            <button
              type="button"
              onClick={() => onEditingChange(false)}
              className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("board.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
            >
              <Check className="h-4 w-4" />
              {t("board.save")}
            </button>
          </div>
        </div>
        {board}
      </div>

      {/* The widget list: what is on the board and what can go on it. */}
      <aside className="xl:sticky xl:top-2 xl:self-start">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
          <p className="text-[15px] font-semibold text-foreground">{t("board.widgets")}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t("board.widgetsHint")}</p>
          {hidden.length > 0 && (
            <ul className="mt-3 space-y-2">
              {hidden.map((w) => {
                const Icon = w.icon;
                return (
                  <li key={w.id}>
                    <div
                      onPointerDown={(e) => pickUp(w.id, e, true)}
                      className="group flex cursor-grab items-center gap-2.5 rounded-xl border border-dashed border-border bg-surface/60 p-2.5 transition-colors hover:border-primary/50 hover:bg-primary/[0.04] active:cursor-grabbing"
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                          TONE_TILE[w.tone],
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">
                          {w.title}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {w.sizes.map((s) => SPAN_LABEL[s]).join(" · ")}
                        </span>
                      </span>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => add(w.id)}
                        aria-label={t("board.add", { name: w.title })}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {t("board.onBoard", { count: layout.order.length })}
          </p>
          <ul className="mt-2 space-y-1">
            {layout.order.map((id) => {
              const w = byId.get(id)!;
              const Icon = w.icon;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] text-muted-foreground"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{w.title}</span>
                  <span className="font-mono text-[11px] text-subtle">
                    {SPAN_LABEL[layout.size[id] ?? w.sizes.at(-1)!]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* The card under the pointer while it is carried. */}
      {drag && dragged && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[80] flex flex-col overflow-hidden rounded-[var(--radius)] border border-primary/60 bg-card shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5),0_0_0_4px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
          style={{
            left: drag.x - drag.offX,
            top: drag.y - drag.offY,
            width: drag.w,
            height: drag.h,
            transform: "rotate(0.8deg) scale(1.02)",
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <GripVertical className="h-4 w-4 text-subtle" />
            <span
              className={cn("grid h-6 w-6 place-items-center rounded-md", TONE_TILE[dragged.tone])}
            >
              <dragged.icon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-[13px] font-semibold text-foreground">
              {dragged.title}
            </span>
          </div>
          <div className="flex-1 bg-[repeating-linear-gradient(135deg,transparent_0_12px,color-mix(in_oklab,var(--primary)_6%,transparent)_12px_24px)]" />
        </div>
      )}
    </div>
  );
}

/** «Panelni sozlash»: opens a page's board editor (move, resize, add, remove cards). */
export function BoardCustomizeButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className="ctl-soft inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold text-foreground hover:text-primary phone:hidden"
    >
      <LayoutDashboard className="h-4 w-4" />
      {t("board.customize")}
    </button>
  );
}
