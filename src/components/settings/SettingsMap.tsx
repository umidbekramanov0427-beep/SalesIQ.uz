import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import type { CardTone } from "@/components/layout/Primitives";
import { TONE_TILE } from "@/lib/tones";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Sozlamalar as the admin console's map: the person in the middle (their
// avatar, ringed by how much of their setup is done), their own settings on
// the left and the company's on the right, each card wired to the core --
// a live cable when that part is set up, a dashed one when it waits for
// them, a plain wire for a page that has nothing to set.

export type MapState = "ok" | "todo" | "page";

export type SettingsMapItem = {
  key: string;
  icon: LucideIcon;
  tone: CardTone;
  title: string;
  description: string;
  /** One line about where it stands ("2FA o'chiq", "Telegram ulangan"). */
  status: string;
  state: MapState;
  /** A page elsewhere (the billing page) instead of a section here. */
  to?: "/billing" | "/daily-report-settings";
};

type Cable = { key: string; d: string; state: MapState; current: boolean };

function MapCard({
  item,
  current,
  onOpen,
  cardRef,
}: {
  item: SettingsMapItem;
  current: boolean;
  onOpen: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "icon-tile grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            TONE_TILE[item.tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5 text-left">
          <h3 className="truncate text-[15px] font-semibold leading-snug text-foreground">
            {item.title}
          </h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{item.description}</p>
        </div>
        {item.to && <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-subtle" />}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px]">
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 font-medium",
            item.state === "ok"
              ? "text-foreground"
              : item.state === "todo"
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground",
          )}
        >
          {item.state === "page" ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                item.state === "ok"
                  ? "bg-primary shadow-[0_0_8px_var(--primary)]"
                  : "bg-amber-500 shadow-[0_0_6px_rgb(245_158_11/0.6)]",
              )}
            />
          )}
          <span className="truncate">{item.status}</span>
        </span>
        {current ? (
          <span className="shrink-0 rounded-md bg-primary/12 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary">
            {t("setmap.here")}
          </span>
        ) : (
          <span className="shrink-0 font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            {item.to ? t("setmap.go") : t("setmap.open")}
          </span>
        )}
      </div>
    </>
  );
  const cls = cn(
    "admin-card group relative flex w-full flex-col rounded-2xl border bg-card p-3.5 text-left transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    current
      ? "border-primary/60 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_20%,transparent),0_14px_34px_-22px_var(--console-glow,transparent)]"
      : "border-border hover:border-foreground/20",
  );
  return (
    <div ref={cardRef}>
      {item.to ? (
        <Link to={item.to} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} aria-current={current || undefined} className={cls}>
          {body}
        </button>
      )}
    </div>
  );
}

export function SettingsMap({
  left,
  right,
  leftCaption,
  rightCaption,
  activeKey,
  onOpen,
  core,
  variant = "map",
}: {
  left: SettingsMapItem[];
  right: SettingsMapItem[];
  leftCaption: string;
  rightCaption: string;
  /** The open section (none on the map itself). */
  activeKey: string | null;
  onOpen: (key: string) => void;
  /** The whole map (Sozlamalar's front page) or one row over an open section. */
  variant?: "map" | "row";
  core: { name: string; initials: string; avatarUrl: string | null; role: string };
}) {
  const { t } = useI18n();
  const all = [...left, ...right];
  const stateful = all.filter((i) => i.state !== "page");
  const done = stateful.filter((i) => i.state === "ok").length;
  const share = stateful.length ? done / stateful.length : 1;

  const open = variant === "map";

  const wrapRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [cables, setCables] = useState<Cable[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const leftKeys = new Set(left.map((i) => i.key));
  const signature = all.map((i) => `${i.key}:${i.state}`).join("|");

  // Cables run from where the cards really are, measured after each layout change.
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const coreEl = coreRef.current;
    if (!wrap || !coreEl) return;
    const wb = wrap.getBoundingClientRect();
    const cb = coreEl.getBoundingClientRect();
    const cy = cb.top - wb.top + cb.height / 2;
    const next: Cable[] = [];
    for (const it of all) {
      const el = cardRefs.current.get(it.key);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      const isLeft = leftKeys.has(it.key);
      const y1 = b.top - wb.top + 30;
      const x1 = isLeft ? b.right - wb.left : b.left - wb.left;
      const x2 = isLeft ? cb.left - wb.left + 4 : cb.right - wb.left - 4;
      const spread = Math.min(20, cb.height / 4);
      const y2 = cy + Math.max(-spread, Math.min(spread, (y1 - cy) / 6));
      const dx = (x2 - x1) * 0.55;
      next.push({
        key: it.key,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        state: it.state,
        current: it.key === activeKey,
      });
    }
    setBox({ w: wb.width, h: wb.height });
    setCables(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, activeKey]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    measure();
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure, open]);

  const column = (list: SettingsMapItem[], caption: string) => (
    <div className="flex min-w-0 flex-col justify-center gap-3">
      <p className="console-caption px-1">{caption}</p>
      {list.map((it) => (
        <MapCard
          key={it.key}
          item={it}
          current={it.key === activeKey}
          onOpen={() => onOpen(it.key)}
          cardRef={(el) => {
            if (el) cardRefs.current.set(it.key, el);
            else cardRefs.current.delete(it.key);
          }}
        />
      ))}
    </div>
  );

  // The ring around the avatar: how much of the setup is done.
  const R = 62;
  const C = 2 * Math.PI * R;

  if (!open) {
    // Over an open section: one row of the sections, one click to each.
    return (
      <div className="mb-6 phone:hidden">
        <div className="admin-card flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card/70 p-1.5">
          {all.map((it) => {
            const Icon = it.icon;
            const cls = cn(
              "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors",
              it.key === activeKey
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            );
            const inner = (
              <>
                <Icon className="h-4 w-4" />
                {it.title}
                {it.state === "todo" && it.key !== activeKey && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </>
            );
            return it.to ? (
              <Link key={it.key} to={it.to} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={it.key} type="button" onClick={() => onOpen(it.key)} className={cls}>
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <section className="admin-card relative overflow-hidden rounded-[20px] border border-border bg-card/70 p-5 phone:p-3.5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="console-caption">{t("setmap.caption")}</p>
          <p className="console-caption">
            <span className="text-primary">{done}</span> / {stateful.length} {t("setmap.ready")}
          </p>
        </div>
        <div
          ref={wrapRef}
          className="relative grid grid-cols-[minmax(0,1fr)_minmax(190px,220px)_minmax(0,1fr)] gap-x-14 phone:grid-cols-1 phone:gap-y-5"
        >
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 phone:hidden"
            width={box.w}
            height={box.h}
            viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}
          >
            {cables.map((c) => {
              const lit = c.state === "ok" || c.current;
              return (
                <g key={c.key}>
                  <path
                    d={c.d}
                    fill="none"
                    stroke={
                      lit ? "var(--primary)" : c.state === "todo" ? "#f59e0b" : "var(--subtle)"
                    }
                    strokeWidth={c.current ? 2.25 : lit ? 1.5 : 1.2}
                    strokeLinecap="round"
                    strokeDasharray={c.state === "todo" && !c.current ? "3 6" : undefined}
                    opacity={lit ? 1 : c.state === "todo" ? 0.8 : 0.45}
                    style={lit ? { filter: "drop-shadow(0 0 5px var(--console-glow))" } : undefined}
                  />
                  {lit && (
                    <path
                      d={c.d}
                      fill="none"
                      stroke="var(--console-flow)"
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      className="console-cable-flow"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {column(left, leftCaption)}

          <div className="relative flex flex-col items-center justify-center py-2 phone:order-first">
            <div
              ref={coreRef}
              className="console-core-pulse relative grid h-[148px] w-[148px] place-items-center rounded-full bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--primary)_18%,var(--card)),var(--card)_70%)]"
            >
              <svg aria-hidden className="absolute inset-0 -rotate-90" viewBox="0 0 148 148">
                <circle cx="74" cy="74" r={R} fill="none" stroke="var(--border)" strokeWidth="5" />
                <circle
                  cx="74"
                  cy="74"
                  r={R}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${C * share} ${C}`}
                  style={{ filter: "drop-shadow(0 0 4px var(--console-glow))" }}
                />
              </svg>
              <div className="relative flex max-w-[104px] flex-col items-center text-center">
                {core.avatarUrl ? (
                  <img
                    src={core.avatarUrl}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-card"
                  />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground">
                    {core.initials}
                  </span>
                )}
                <span className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-tight text-foreground [text-wrap:balance]">
                  {core.name}
                </span>
                <span className="mt-0.5 max-w-full truncate text-[11px] text-muted-foreground">
                  {core.role}
                </span>
                <span className="mt-0.5 font-mono text-[10.5px] font-semibold text-primary">
                  {Math.round(share * 100)}%
                </span>
              </div>
            </div>
          </div>

          {column(right, rightCaption)}
        </div>
        <p className="sr-only">{all.map((i) => `${i.title}: ${i.status}`).join(". ")}</p>
      </section>
    </div>
  );
}
