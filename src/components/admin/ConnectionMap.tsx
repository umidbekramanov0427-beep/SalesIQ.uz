import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CardPicture,
  CatalogCard,
  cardTitleKey,
  useAdminCatalog,
  type CatalogGroup,
  type CatalogItem,
} from "./AdminCatalog";

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

type Cable = { key: string; d: string; live: boolean; stub?: { x: number; y: number } };

export function ConnectionMap({ groups }: { groups: CatalogGroup[] }) {
  const { t } = useI18n();
  const picked = pickMapNodes(groups);
  // The catalog is rebuilt on every render; the map only changes when which
  // services are shown, or their state, does.
  const signature = picked.map((n) => `${n.key}:${n.status?.ok ? 1 : 0}`).join("|");
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
  const liveCount = nodes.filter((n) => n.status?.ok).length;
  const lastEventNode = activity.data?.[0]?.node ?? null;

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
      const y2 = cy + (y1 < cy ? -10 : y1 > cy ? 10 : 0);
      const dx = (x2 - x1) * 0.55;
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const live = !!n.status?.ok;
      next.push({
        key: n.key,
        d,
        live,
        ...(live ? {} : { stub: { x: x1 + (isLeft ? 26 : -26), y: y1 } }),
      });
    }
    setBox({ w: wb.width, h: wb.height });
    setCables(next);
  }, [nodes, left]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    nodeRefs.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [measure]);

  if (nodes.length === 0) return null;

  const column = (items: CatalogItem[]) => (
    <div className="flex min-w-0 flex-col justify-center gap-3">
      {items.map((it) => (
        <CatalogCard
          key={it.key}
          item={it}
          compact
          ref={(el) => {
            if (el) nodeRefs.current.set(it.key, el);
            else nodeRefs.current.delete(it.key);
          }}
        />
      ))}
    </div>
  );

  return (
    <section className="admin-card relative mb-8 overflow-hidden rounded-[20px] border border-border bg-card/70 p-5 phone:p-3.5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="console-caption">{t("console.mapTitle")}</p>
        <p className="console-caption">
          <span className="text-primary">{liveCount}</span> / {nodes.length} {t("console.live")}
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
            c.live ? (
              <g key={c.key}>
                <path
                  d={c.d}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={c.key === lastEventNode ? 2.25 : 1.5}
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
            ) : (
              <g key={c.key}>
                <path
                  d={c.d}
                  fill="none"
                  stroke="var(--border)"
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
            className="console-core-pulse relative grid h-[112px] w-[112px] place-items-center rounded-full border border-primary/40 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--primary)_22%,var(--card)),var(--card)_70%)]"
          >
            <span className="absolute inset-2 rounded-full border border-border/80" />
            <div className="relative flex flex-col items-center">
              <img src="/logo-icon.webp" alt="" className="h-8 w-8 object-contain" />
              <span className="mt-1 text-[13px] font-semibold text-foreground">SalesIQ</span>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {t("console.coreLive", { count: liveCount })}
              </span>
            </div>
          </div>
        </div>

        {column(right)}
      </div>

      {/* The latest events, like a terminal under the map. */}
      <div className="mt-5 grid gap-x-8 gap-y-1.5 border-t border-border pt-4 sm:grid-cols-[96px_minmax(0,1fr)]">
        <p className="console-caption pt-0.5">{t("console.activity")}</p>
        {activity.data && activity.data.length > 0 ? (
          <ul className="grid gap-x-8 gap-y-1 font-mono text-[11.5px] leading-snug lg:grid-cols-2">
            {activity.data.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex min-w-0 gap-2.5 text-muted-foreground">
                <span className="shrink-0 tabular-nums text-subtle">{hhmmss(a.at)}</span>
                <span className="min-w-0 truncate">
                  <span className={cn(a.bad ? "text-destructive" : "text-primary")}>{a.who}</span> →{" "}
                  {a.what}
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
