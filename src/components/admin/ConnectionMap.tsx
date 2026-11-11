import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  FileSignature,
  LayoutGrid,
  PanelLeft,
  Phone,
  Plug,
  Rocket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AdminChrome, SettingsLayout } from "@/components/layout/Primitives";
import { useSidebarConfig } from "@/hooks/use-crm-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CardPicture,
  CatalogCard,
  cardIsLive,
  cardTitleKey,
  useAdminCatalog,
  type CatalogGroup,
  type CatalogGroupKey,
  type CatalogItem,
} from "./AdminCatalog";

const MAP_FOLD_KEY = "salesiq.console.mapOpen";

// The admin console's connections map: SalesIQ in the middle, the company's
// services around it, a cable from each connected one (a dot runs along it)
// and an unplugged stub from the rest, and under the core the latest real
// events -- amoCRM / Bitrix24 syncs, leads from the site, calls, messages.

// Which services are worth a place on the map, best first. Connected ones
// always go first; at most one unconnected telephony provider is shown.
const PREFERRED = [
  "amocrm",
  "telegramLink",
  "instagram",
  "payments",
  "tel_onlinepbx",
  "tel_sipuni",
  "tel_moizvonki",
  "sms",
  "bitrix24",
  "email",
  "didox",
];
const MAX_NODES = 6;

export function pickMapNodes(groups: CatalogGroup[]): CatalogItem[] {
  const pool = groups.flatMap((g) => g.items).filter((it) => it.status?.connection);
  const rank = (it: CatalogItem) => {
    const i = PREFERRED.indexOf(it.key);
    return i === -1 ? PREFERRED.length : i;
  };
  pool.sort((a, b) => rank(a) - rank(b));
  const on = pool.filter((it) => it.status!.ok);
  let telOff = on.some((it) => it.key.startsWith("tel_")) ? 1 : 0;
  const off = pool.filter((it) => {
    if (it.status!.ok) return false;
    if (!it.key.startsWith("tel_")) return true;
    telOff += 1;
    return telOff === 1;
  });
  return [...on, ...off].slice(0, MAX_NODES);
}

type Activity = { at: string; node: string | null; who: string; what: string; bad?: boolean };

const hhmmss = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

// The latest events across the company's integrations, newest first. Each
// source is read on its own and a missing table or right just leaves it out.
function useConsoleActivity(nodes: CatalogItem[]) {
  const { user } = useAuth();
  const { t } = useI18n();
  const orgId = user?.organizationId ?? null;
  const telNode =
    nodes.find((n) => n.key.startsWith("tel_") && n.status?.ok)?.key ??
    nodes.find((n) => n.key.startsWith("tel_"))?.key ??
    null;
  return useQuery({
    queryKey: ["console_activity", orgId, telNode],
    enabled: !!orgId,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<Activity[]> => {
      const org = orgId!;
      const safe = async <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>) => {
        try {
          const { data, error } = await p;
          return error ? [] : (data ?? []);
        } catch {
          return [];
        }
      };
      const [amo, bitrix, incoming, calls, msgs] = await Promise.all([
        safe(
          supabase
            .from("amocrm_sync_log")
            .select("finished_at, synced_count, calls_synced, error, skipped")
            .eq("organization_id", org)
            .order("finished_at", { ascending: false })
            .limit(4),
        ),
        safe(
          supabase
            .from("bitrix24_sync_log")
            .select("finished_at, synced_count, error, skipped")
            .eq("organization_id", org)
            .order("finished_at", { ascending: false })
            .limit(3),
        ),
        safe(
          supabase
            .from("incoming_lead_log")
            .select("created_at, status")
            .eq("organization_id", org)
            .order("created_at", { ascending: false })
            .limit(4),
        ),
        safe(
          supabase
            .from("pbx_calls")
            .select("created_at, direction, missed")
            .eq("organization_id", org)
            .order("created_at", { ascending: false })
            .limit(4),
        ),
        safe(
          supabase
            .from("lead_telegram_messages")
            .select("created_at, channel")
            .eq("organization_id", org)
            .eq("direction", "in")
            .order("created_at", { ascending: false })
            .limit(4),
        ),
      ]);
      const rows: Activity[] = [];
      for (const r of amo)
        rows.push({
          at: r.finished_at,
          node: "amocrm",
          who: "amoCRM",
          what: r.error
            ? t("console.ev.syncError")
            : r.skipped || !r.synced_count
              ? t("console.ev.syncNone")
              : t("console.ev.synced", { count: r.synced_count }),
          bad: !!r.error,
        });
      for (const r of bitrix)
        rows.push({
          at: r.finished_at,
          node: "bitrix24",
          who: "Bitrix24",
          what: r.error
            ? t("console.ev.syncError")
            : r.skipped || !r.synced_count
              ? t("console.ev.syncNone")
              : t("console.ev.synced", { count: r.synced_count }),
          bad: !!r.error,
        });
      for (const r of incoming) {
        const ok = r.status !== "failed";
        rows.push({
          at: r.created_at,
          node: "webhook",
          who: t("console.ev.site"),
          what: ok ? t("console.ev.leadIn") : t("console.ev.leadErr"),
          bad: !ok,
        });
      }
      for (const r of calls)
        rows.push({
          at: r.created_at,
          node: telNode,
          who: t("hub.group.telephony"),
          what: r.missed
            ? t("console.ev.callMissed")
            : r.direction === "outgoing" || r.direction === "out"
              ? t("console.ev.callOut")
              : t("console.ev.callIn"),
          bad: !!r.missed,
        });
      for (const r of msgs)
        rows.push({
          at: r.created_at,
          node: r.channel === "instagram" ? "instagram" : null,
          who: r.channel === "instagram" ? "Instagram" : "Telegram",
          what: t("console.ev.message"),
        });
      return rows
        .filter((r) => r.at)
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 6);
    },
  });
}

type NodeState = "live" | "off" | "page";
type Cable = {
  key: string;
  d: string;
  state: NodeState;
  current: boolean;
  stub?: { x: number; y: number };
};

/** A card on the map: lit (connected / set up / in the menu), unplugged, or a plain page. */
function nodeState(it: CatalogItem, pinned: string[]): NodeState {
  if (cardIsLive(it, pinned)) return "live";
  return it.status || it.pinPath ? "off" : "page";
}

// Each section of the admin panel as its own core (the group's mark).
const GROUP_ICON: Record<CatalogGroupKey, LucideIcon> = {
  start: Rocket,
  team: Users,
  crm: FileSignature,
  bots: Bot,
  integrations: Plug,
  telephony: Phone,
  ai: BrainCircuit,
  workspace: PanelLeft,
  modules: LayoutGrid,
};
const MAX_GROUP_NODES = 12;

/**
 * The console's map. Without `group`: SalesIQ in the middle and the
 * company's main services around it. With `group`: that section of the
 * admin panel in the middle and every page in it around (`activeKey`, the
 * page that is open, is marked).
 */
export function ConnectionMap({
  groups,
  group = null,
  activeKey = null,
  className,
}: {
  groups: CatalogGroup[];
  group?: CatalogGroup | null;
  activeKey?: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  const sidebar = useSidebarConfig();
  const pinned = sidebar.pinned;
  const picked = group ? group.items.slice(0, MAX_GROUP_NODES) : pickMapNodes(groups);
  // The catalog is rebuilt on every render; the map only changes when which
  // cards are shown, or their state, does.
  const signature = picked.map((n) => `${n.key}:${nodeState(n, pinned)}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => picked, [signature]);
  const activity = useConsoleActivity(nodes);
  const wrapRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [cables, setCables] = useState<Cable[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const half = Math.ceil(nodes.length / 2);
  const left = useMemo(() => nodes.slice(0, half), [nodes, half]);
  const right = useMemo(() => nodes.slice(half), [nodes, half]);
  const stateful = nodes.filter((n) => nodeState(n, pinned) !== "page");
  const liveCount = stateful.filter((n) => nodeState(n, pinned) === "live").length;
  const nodeKeys = new Set(nodes.map((n) => n.key));
  // A section's map lists only its own events (none: no activity row).
  const events = (activity.data ?? []).filter((a) => !group || (a.node && nodeKeys.has(a.node)));
  const lastEventNode = events[0]?.node ?? null;
  const showActivity = !group || events.length > 0;

  // Cables are drawn from where the cards really are: measured after every
  // layout change (a card unfolding, the window resizing).
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const core = coreRef.current;
    if (!wrap || !core) return;
    const wb = wrap.getBoundingClientRect();
    const cb = core.getBoundingClientRect();
    const cy = cb.top - wb.top + cb.height / 2;
    const next: Cable[] = [];
    for (const n of nodes) {
      const el = nodeRefs.current.get(n.key);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      const isLeft = left.includes(n);
      // The cable leaves the card at its header row, as a plug would.
      const y1 = b.top - wb.top + 30;
      const x1 = isLeft ? b.right - wb.left : b.left - wb.left;
      const x2 = isLeft ? cb.left - wb.left + 4 : cb.right - wb.left - 4;
      const spread = Math.min(18, cb.height / 4);
      const y2 = cy + Math.max(-spread, Math.min(spread, (y1 - cy) / 6));
      const dx = (x2 - x1) * 0.55;
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const state = nodeState(n, sidebar.pinned);
      next.push({
        key: n.key,
        d,
        state,
        current: n.key === activeKey,
        ...(state === "off" ? { stub: { x: x1 + (isLeft ? 26 : -26), y: y1 } } : {}),
      });
    }
    setBox({ w: wb.width, h: wb.height });
    setCables(next);
  }, [nodes, left, activeKey, sidebar.pinned]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    nodeRefs.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [measure]);

  if (nodes.length === 0) return null;

  const CoreIcon = group ? GROUP_ICON[group.key] : null;
  const column = (items: CatalogItem[]) => (
    <div className="flex min-w-0 flex-col justify-center gap-3">
      {items.map((it) => (
        <CatalogCard
          key={it.key}
          item={it}
          compact
          current={it.key === activeKey}
          ref={(el) => {
            if (el) nodeRefs.current.set(it.key, el);
            else nodeRefs.current.delete(it.key);
          }}
        />
      ))}
    </div>
  );

  return (
    <section
      className={cn(
        "admin-card relative mb-8 overflow-hidden rounded-[20px] border border-border bg-card/70 p-5 phone:p-3.5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="console-caption">
          {group ? t(`hub.group.${group.key}`) : t("console.mapTitle")}
        </p>
        <p className="console-caption">
          {stateful.length > 0 ? (
            <>
              <span className="text-primary">{liveCount}</span> / {stateful.length}{" "}
              {t("console.live")}
            </>
          ) : (
            t("console.pages", { count: nodes.length })
          )}
        </p>
      </div>
      <div
        ref={wrapRef}
        className="relative grid grid-cols-[minmax(0,1fr)_minmax(180px,220px)_minmax(0,1fr)] gap-x-14 gap-y-4 phone:grid-cols-1"
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 phone:hidden"
          width={box.w}
          height={box.h}
          viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}
        >
          {cables.map((c) =>
            c.state === "live" ? (
              <g key={c.key}>
                <path
                  d={c.d}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={c.current || c.key === lastEventNode ? 2.25 : 1.5}
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 5px var(--console-glow))" }}
                />
                <path
                  d={c.d}
                  fill="none"
                  stroke="#dbe8ff"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  className="console-cable-flow"
                />
              </g>
            ) : c.state === "page" ? (
              // A page is always part of its section: a plain wire, lit
              // when it is the page that is open.
              <g key={c.key}>
                <path
                  d={c.d}
                  fill="none"
                  stroke={c.current ? "var(--primary)" : "var(--subtle)"}
                  strokeWidth={c.current ? 2 : 1.1}
                  strokeLinecap="round"
                  opacity={c.current ? 1 : 0.45}
                  style={
                    c.current ? { filter: "drop-shadow(0 0 5px var(--console-glow))" } : undefined
                  }
                />
                {c.current && (
                  <path
                    d={c.d}
                    fill="none"
                    stroke="#dbe8ff"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    className="console-cable-flow"
                  />
                )}
              </g>
            ) : (
              <g key={c.key}>
                <path
                  d={c.d}
                  fill="none"
                  stroke={c.current ? "var(--primary)" : "var(--border)"}
                  strokeWidth={1.25}
                  strokeDasharray="3 6"
                  opacity={0.9}
                />
                {c.stub && (
                  <circle
                    cx={c.stub.x}
                    cy={c.stub.y}
                    r={3.5}
                    fill="var(--card)"
                    stroke="var(--subtle)"
                    strokeWidth={1.25}
                  />
                )}
              </g>
            ),
          )}
        </svg>

        {column(left)}

        <div className="relative flex flex-col items-center justify-center py-2 phone:order-first">
          <div
            ref={coreRef}
            className="console-core-pulse relative grid h-[124px] w-[124px] place-items-center rounded-full border border-primary/40 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--primary)_22%,var(--card)),var(--card)_70%)]"
          >
            <span className="absolute inset-2 rounded-full border border-border/80" />
            <div className="relative flex max-w-[96px] flex-col items-center text-center">
              {CoreIcon ? (
                <CoreIcon className="h-7 w-7 text-primary" />
              ) : (
                <img src="/logo-icon.webp" alt="" className="h-8 w-8 object-contain" />
              )}
              <span className="mt-1 text-[12.5px] font-semibold leading-tight text-foreground [text-wrap:balance]">
                {group ? t(`hub.group.${group.key}`) : "SalesIQ"}
              </span>
              <span className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                {stateful.length > 0
                  ? t("console.coreLive", { count: liveCount })
                  : t("console.pages", { count: nodes.length })}
              </span>
            </div>
          </div>
        </div>

        {column(right)}
      </div>

      {showActivity && (
        // The latest events, like a terminal under the map.
        <div className="mt-5 grid gap-x-8 gap-y-1.5 border-t border-border pt-4 sm:grid-cols-[96px_minmax(0,1fr)]">
          <p className="console-caption pt-0.5">{t("console.activity")}</p>
          {events.length > 0 ? (
            <ul className="grid gap-x-8 gap-y-1 font-mono text-[11.5px] leading-snug lg:grid-cols-2">
              {events.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex min-w-0 gap-2.5 text-muted-foreground">
                  <span className="shrink-0 tabular-nums text-subtle">{hhmmss(a.at)}</span>
                  <span className="min-w-0 truncate">
                    <span className={cn(a.bad ? "text-destructive" : "text-primary")}>{a.who}</span>{" "}
                    → {a.what}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11.5px] text-subtle">
              {activity.isLoading ? "…" : t("console.noActivity")}
            </p>
          )}
        </div>
      )}
      <p className="sr-only">
        {nodes.map((n) => `${t(cardTitleKey(n))}: ${n.status?.label ?? ""}`).join(". ")}
      </p>
    </section>
  );
}

// An integration page's link to SalesIQ, under its header: the service and
// SalesIQ joined by a live cable when connected, an unplugged gap when not.
export function ConnectionStrip({ itemKey }: { itemKey: string }) {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const item = groups.flatMap((g) => g.items).find((it) => it.key === itemKey);
  if (!item?.status?.connection) return null;
  const live = item.status.ok;
  return (
    <div className="admin-card mb-6 flex max-w-4xl items-center gap-4 rounded-2xl border border-border bg-card/70 px-4 py-3.5 phone:gap-3 phone:px-3">
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/40 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--primary)_22%,var(--card)),var(--card)_75%)]">
          <img src="/logo-icon.webp" alt="" className="h-5 w-5 object-contain" />
        </span>
        <span className="text-[13.5px] font-semibold text-foreground phone:hidden">SalesIQ</span>
      </span>
      <svg
        aria-hidden
        className="h-6 min-w-0 flex-1"
        preserveAspectRatio="none"
        viewBox="0 0 400 24"
      >
        {live ? (
          <>
            <path
              d="M 0 12 L 400 12"
              stroke="var(--primary)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ filter: "drop-shadow(0 0 4px var(--console-glow))" }}
            />
            <path
              d="M 400 12 L 0 12"
              stroke="#dbe8ff"
              strokeWidth={3.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="console-cable-flow"
            />
          </>
        ) : (
          <>
            <path
              d="M 0 12 L 170 12"
              stroke="var(--border)"
              strokeWidth={1.25}
              strokeDasharray="3 6"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M 230 12 L 400 12"
              stroke="var(--border)"
              strokeWidth={1.25}
              strokeDasharray="3 6"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      <span className="flex min-w-0 shrink-0 items-center gap-2.5">
        <CardPicture item={item} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-foreground">
            {t(cardTitleKey(item))}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 font-mono text-[11px]",
              live ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "bg-primary shadow-[0_0_8px_var(--primary)]" : "bg-subtle",
              )}
            />
            {live ? t("console.active") : t("console.notConnected")}
          </span>
        </span>
      </span>
    </div>
  );
}

// ---- The console's chrome on every section page ----------------------------

// The catalog card the open page belongs to (and its group): an exact path
// (and telephony provider) first, then the longest path the page sits under.
function useCurrentSection(): { group: CatalogGroup | null; item: CatalogItem | null } {
  const groups = useAdminCatalog();
  const { path, provider } = useRouterState({
    select: (st) => ({
      path: st.location.pathname.replace(/\/$/, ""),
      provider: (st.location.search as Record<string, unknown>)["provider"],
    }),
  });
  let best: { group: CatalogGroup; item: CatalogItem; score: number } | null = null;
  for (const g of groups) {
    if (g.key === "modules") continue;
    for (const it of g.items) {
      const wants = it.search?.["provider"];
      if (wants !== undefined && wants !== provider) continue;
      const score =
        it.to === path ? 1000 + (wants ? 1 : 0) : path.startsWith(`${it.to}/`) ? it.to.length : -1;
      if (score >= 0 && (!best || score > best.score)) best = { group: g, item: it, score };
    }
  }
  if (best) return { group: best.group, item: best.item };
  if (path.startsWith("/admin/telephony"))
    return { group: groups.find((g) => g.key === "telephony") ?? null, item: null };
  if (path.startsWith("/integrations"))
    return { group: groups.find((g) => g.key === "integrations") ?? null, item: null };
  return { group: null, item: null };
}

/** "Admin panel · Jamoa va huquqlar" over a section's title. */
export function AdminSectionCrumb() {
  const { t } = useI18n();
  const { group } = useCurrentSection();
  const parts = [t("admin.title")];
  if (group) parts.push(t(`hub.group.${group.key}`));
  return <p className="console-caption mb-1.5 phone:hidden">{parts.join(" · ")}</p>;
}

/**
 * Under a section page's header: its group's map, the open page marked --
 * the same console as the hub, one click to any page of the section.
 * Folds away (remembered per browser) for those who know the way.
 */
export function AdminSectionStrip() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const { group, item } = useCurrentSection();
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(MAP_FOLD_KEY) !== "0";
    } catch {
      return true;
    }
  });
  if (!group || group.items.length < 2) return null;
  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(MAP_FOLD_KEY, v ? "0" : "1");
      } catch {
        // storage unavailable: folds for this visit only
      }
      return !v;
    });
  };
  return (
    <div className="mb-6">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-subtle transition-colors hover:bg-accent hover:text-foreground"
        >
          {open ? t("console.mapHide") : t("console.mapShow")}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <ConnectionMap
          groups={groups}
          group={group}
          activeKey={item?.key ?? null}
          className="mb-0"
        />
      )}
    </div>
  );
}

const CONSOLE_CHROME = { Crumb: AdminSectionCrumb, Strip: AdminSectionStrip };

/** A page an admin card opens outside /admin: the console's layout and chrome around it. */
export function AdminConsolePage({ children }: { children: ReactNode }) {
  return (
    <AdminChrome.Provider value={CONSOLE_CHROME}>
      <SettingsLayout variant="admin">{children}</SettingsLayout>
    </AdminChrome.Provider>
  );
}
