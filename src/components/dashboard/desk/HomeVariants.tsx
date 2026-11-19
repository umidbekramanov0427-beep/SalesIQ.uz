import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Percent,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CardTools, useCardChrome } from "@/components/layout/CardTools";
import { useCurrency } from "@/lib/currency";
import { change, type DeskData, type DeskManager } from "@/lib/desk";
import { useI18n } from "@/lib/i18n";
import { planProgress } from "@/lib/sales-plan";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  ChannelsBlock,
  DynamicsBlock,
  FunnelBlock,
  ManagersBlock,
  SourcesBlock,
} from "./DeskBlocks";

// Bosh sahifa -> Ish stoli in four trial layouts (owner, 2026-11-19: "give
// me variants in the real thing, then we drop what is not needed"). Each
// one draws the same live figures (useDesk) a different way:
//   A  Komanda markazi -- four key figures, the sales curve with today
//      beside it, the managers' race and the channels, the funnel.
//   B  Plan markazda   -- the month's plan as the hero, every manager's own
//      plan as a card under it.
//   C  Avval harakat   -- what needs doing first (signals worked out from
//      the figures), then the figures.
//   D  Hisobot jadvali -- one table of figures against the period before,
//      then the managers', channels' and sources' tables.

export const HOME_VARIANTS = ["current", "a", "b", "c", "d"] as const;
export type HomeVariant = (typeof HOME_VARIANTS)[number];

export type VariantProps = {
  d: DeskData;
  revenueLabel: string;
  periodText: string;
  prevText: string;
  canPlan: boolean;
  onEditPlan: () => void;
  onPickFunnel: (f: string | null) => void;
};

const CARD = "surface-card !rounded-[12px]";

/* ---- Small shared pieces ------------------------------------------------ */

function Delta({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums",
        value === 0
          ? "bg-muted text-muted-foreground"
          : good
            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
      )}
    >
      <Icon className="h-3 w-3" />
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

function Tile({
  icon: Icon,
  tone,
  size = "md",
}: {
  icon: LucideIcon;
  tone: CardTone;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px]",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        TONE_TILE[tone],
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

/** A key figure: icon, name, a large value, its change and one line under it. */
function Figure({
  tipKey,
  label,
  icon,
  tone,
  value,
  delta,
  sub,
  children,
  big = false,
}: {
  tipKey: string;
  label: string;
  icon: LucideIcon;
  tone: CardTone;
  value: ReactNode;
  delta?: number | null;
  sub?: ReactNode;
  children?: ReactNode;
  big?: boolean;
}) {
  const chrome = useCardChrome({ tipKey, label });
  if (chrome.hidden) return null;
  return (
    <div className={cn(CARD, "flex flex-col p-5")}>
      <div className="flex items-center gap-3">
        <Tile icon={icon} tone={tone} size="sm" />
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-muted-foreground">
          {label}
        </p>
        <CardTools chrome={chrome} label={label} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p
          className={cn(
            "font-semibold leading-none tracking-tight tabular-nums text-foreground",
            big ? "text-[34px]" : "text-[28px]",
          )}
        >
          {value}
        </p>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      {children}
      {sub && <p className="mt-2 text-[13px] tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Bar({
  pct,
  tone = "emerald",
  className,
}: {
  pct: number;
  tone?: "emerald" | "amber" | "primary" | "rose";
  className?: string;
}) {
  const color = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    primary: "bg-primary",
    rose: "bg-rose-500",
  }[tone];
  return (
    <span className={cn("block h-2 overflow-hidden rounded-full bg-muted", className)}>
      <span
        className={cn("block h-full rounded-full transition-[width] duration-500", color)}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

/** A ring for a share (plan done): the track, the arc, the figure in the middle. */
function Ring({
  pct,
  size = 168,
  stroke = 14,
  tone,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  tone: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(shown / 100) * c} ${c}`}
      />
    </svg>
  );
}

function Panel({
  title,
  icon,
  tone,
  actions,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  tone: CardTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(CARD, "flex flex-col", className)}>
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <Tile icon={icon} tone={tone} size="sm" />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
          {title}
        </h3>
        {actions}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

const planOf = (d: DeskData) => planProgress(d.plan.team, d.plan.fact, d.plan.month);
const managerPlan = (d: DeskData, m: DeskManager) => d.plan.people[m.id] ?? m.plan ?? 0;
const byRevenue = (d: DeskData) => [...d.managers].sort((a, b) => b.revenue.cur - a.revenue.cur);

const STATUS_CHIP: Record<string, string> = {
  done: "bg-emerald-500/14 text-emerald-700 dark:text-emerald-300",
  on_track: "bg-emerald-500/14 text-emerald-700 dark:text-emerald-300",
  behind: "bg-amber-500/16 text-amber-800 dark:text-amber-200",
  no_plan: "bg-muted text-muted-foreground",
};

/** The managers' race: rank, name, money, and the bar to their own plan. */
function ManagerRace({ d, limit }: { d: DeskData; limit?: number }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const list = byRevenue(d).slice(0, limit ?? d.managers.length);
  const top = Math.max(1, ...list.map((m) => m.revenue.cur));
  if (!list.length) return <p className="py-6 text-center text-[13px] text-muted-foreground">—</p>;
  return (
    <ol className="space-y-3.5">
      {list.map((m, i) => {
        const plan = managerPlan(d, m);
        const pct = plan > 0 ? Math.round((m.revenue.cur / plan) * 100) : null;
        return (
          <li key={m.id} className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold",
                i === 0
                  ? "bg-amber-400 text-amber-950"
                  : i === 1
                    ? "bg-slate-300 text-slate-800"
                    : i === 2
                      ? "bg-orange-300 text-orange-950"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[14px] font-semibold text-foreground">{m.name}</p>
                <p className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-foreground">
                  {format(m.revenue.cur)}
                </p>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <Bar
                  pct={pct ?? (m.revenue.cur / top) * 100}
                  tone={pct == null ? "primary" : pct >= 100 ? "emerald" : "amber"}
                  className="flex-1"
                />
                <span className="w-[86px] whitespace-nowrap text-right text-[12px] tabular-nums text-muted-foreground">
                  {pct == null ? t("homev.salesN", { n: m.sales.cur }) : t("homev.ofPlan", { pct })}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---- A · Komanda markazi ------------------------------------------------- */

export function VariantA(p: VariantProps) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { d } = p;
  const plan = planOf(d);
  const pct = plan.pct ?? 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          tipKey="desk.revenue"
          label={p.revenueLabel}
          icon={Wallet}
          tone="primary"
          value={format(d.revenue.cur)}
          delta={change(d.revenue)}
          sub={t("homev.prevWas", { v: format(d.revenue.prev) })}
        />
        <Figure
          tipKey="desk.plan"
          label={t("desk.plan")}
          icon={Target}
          tone="amber"
          value={d.plan.team > 0 ? `${pct}%` : "—"}
          sub={
            d.plan.team > 0
              ? t("homev.perDayLeft", { v: format(plan.perDayNeeded), n: plan.daysLeft })
              : t("homev.noPlan")
          }
        >
          {d.plan.team > 0 && (
            <Bar pct={pct} tone={plan.status === "behind" ? "amber" : "emerald"} className="mt-3" />
          )}
        </Figure>
        <Figure
          tipKey="desk.count"
          label={t("desk.count")}
          icon={ShoppingCart}
          tone="sky"
          value={t("desk.pcs", { n: d.count.cur })}
          delta={change(d.count)}
          sub={t("homev.avgCheck", { v: format(d.avgCheck.cur) })}
        />
        <Figure
          tipKey="desk.conversion"
          label={t("desk.conversion")}
          icon={Percent}
          tone="rose"
          value={`${d.conversion.cur}%`}
          delta={change(d.conversion)}
          sub={t("homev.fromLeads", { n: d.leads.cur })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DynamicsBlock d={d} curLabel={p.periodText} prevLabel={p.prevText} />
        </div>
        <Panel title={t("homev.today")} icon={Wallet} tone="emerald">
          <p className="text-[13px] font-medium text-muted-foreground">{t("desk.today")}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <p className="text-[30px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {format(d.today.revenue)}
            </p>
            <Delta value={change({ cur: d.today.revenue, prev: d.today.yRevenue })} />
          </div>
          <p className="mt-2 text-[13px] tabular-nums text-muted-foreground">
            {t("homev.yesterdayUntil", { time: d.today.until, v: format(d.today.yRevenue) })}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[10px] bg-muted/60 px-3.5 py-3">
              <p className="text-[12px] text-muted-foreground">{t("homev.todaySales")}</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-foreground">
                {d.today.count}
              </p>
            </div>
            <div className="rounded-[10px] bg-muted/60 px-3.5 py-3">
              <p className="text-[12px] text-muted-foreground">{t("homev.newLeads")}</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-foreground">
                {d.leads.cur}
              </p>
            </div>
          </div>
          <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("homev.leaders")}
          </p>
          <div className="mt-3">
            <ManagerRace d={d} limit={3} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("homev.race")} icon={Trophy} tone="amber">
          <ManagerRace d={d} />
        </Panel>
        <ChannelsBlock d={d} />
      </div>

      <FunnelBlock d={d} onPick={p.onPickFunnel} />
    </div>
  );
}

/* ---- B · Plan markazda --------------------------------------------------- */

export function VariantB(p: VariantProps) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { d } = p;
  const plan = planOf(d);
  const pct = plan.pct ?? 0;
  const days = d.dynamics.days;
  const peak = Math.max(1, plan.perDayNeeded, ...days.map((x) => x.cur));
  const ringColor = plan.status === "behind" ? "#f59e0b" : "#10b981";
  return (
    <div className="space-y-4">
      <section className={cn(CARD, "p-6")}>
        {d.plan.team > 0 ? (
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            <div className="relative grid place-items-center">
              <Ring pct={pct} tone={ringColor} />
              <div className="absolute text-center">
                <p className="text-[34px] font-semibold leading-none tabular-nums text-foreground">
                  {pct}%
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{t("homev.planDone")}</p>
              </div>
            </div>
            <div className="grid min-w-[300px] flex-1 grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-3">
              <Stat label={t("homev.planLbl")} value={format(d.plan.team)} />
              <Stat label={t("homev.factLbl")} value={format(d.plan.fact)} strong />
              <Stat
                label={t("homev.forecast")}
                value={format(plan.forecast)}
                hint={
                  plan.forecastPct != null
                    ? t("homev.ofPlan", { pct: plan.forecastPct })
                    : undefined
                }
              />
              <Stat label={t("homev.perDay")} value={format(plan.perDayNeeded)} />
              <Stat label={t("homev.daysLeftLbl")} value={t("homev.daysN", { n: plan.daysLeft })} />
              <div>
                <p className="text-[12.5px] text-muted-foreground">{t("homev.statusLbl")}</p>
                <span
                  className={cn(
                    "mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold",
                    STATUS_CHIP[plan.status],
                  )}
                >
                  {t(`homev.status.${plan.status}`)}
                </span>
              </div>
            </div>
            {/* Each day's sales against what a day needs to make the plan. */}
            <div className="w-full min-w-[320px] xl:w-[380px]">
              <p className="mb-2 text-[12.5px] font-semibold text-muted-foreground">
                {t("homev.dailyVsNeed")}
              </p>
              <div className="relative flex h-[120px] items-end gap-[3px]">
                {plan.perDayNeeded > 0 && (
                  <span
                    className="absolute inset-x-0 border-t border-dashed border-amber-500"
                    style={{ bottom: `${(plan.perDayNeeded / peak) * 100}%` }}
                  />
                )}
                {days.map((x) => (
                  <span
                    key={x.label}
                    title={`${x.label}: ${format(x.cur)}`}
                    className={cn(
                      "min-w-0 flex-1 rounded-t-[3px]",
                      x.cur >= plan.perDayNeeded && x.cur > 0 ? "bg-emerald-500" : "bg-primary/45",
                    )}
                    style={{ height: `${Math.max(2, (x.cur / peak) * 100)}%` }}
                  />
                ))}
              </div>
              <p className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="inline-block w-5 border-t border-dashed border-amber-500" />
                {t("homev.needLine", { v: format(plan.perDayNeeded) })}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-5">
            <Tile icon={Target} tone="amber" />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-semibold text-foreground">{t("homev.noPlanTitle")}</p>
              <p className="mt-1 text-[13.5px] text-muted-foreground">{t("homev.noPlanHint")}</p>
            </div>
            {p.canPlan && (
              <button
                type="button"
                onClick={p.onEditPlan}
                className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold"
              >
                <Target className="h-4 w-4" />
                {t("homev.setPlan")}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {byRevenue(d).map((m) => {
          const mp = managerPlan(d, m);
          const mProg = planProgress(mp, m.revenue.cur, d.plan.month);
          const mPct = mProg.pct ?? 0;
          return (
            <div key={m.id} className={cn(CARD, "p-5")}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[15px] font-semibold text-foreground">{m.name}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                    STATUS_CHIP[mProg.status],
                  )}
                >
                  {t(`homev.status.${mProg.status}`)}
                </span>
              </div>
              <p className="mt-3 text-[24px] font-semibold leading-none tabular-nums text-foreground">
                {format(m.revenue.cur)}
              </p>
              {mp > 0 ? (
                <>
                  <Bar
                    pct={mPct}
                    tone={mProg.status === "behind" ? "amber" : "emerald"}
                    className="mt-3"
                  />
                  <p className="mt-2 text-[12.5px] tabular-nums text-muted-foreground">
                    {t("homev.mgrPlanLine", { pct: mPct, plan: format(mp) })}
                  </p>
                  {mProg.perDayNeeded > 0 && (
                    <p className="text-[12.5px] tabular-nums text-muted-foreground">
                      {t("homev.perDayShort", { v: format(mProg.perDayNeeded) })}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[12.5px] text-muted-foreground">{t("homev.noMgrPlan")}</p>
              )}
              <div className="mt-3 flex gap-4 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
                <span>{t("homev.salesN", { n: m.sales.cur })}</span>
                <span>{t("homev.convShort", { v: m.conversion })}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DynamicsBlock d={d} curLabel={p.periodText} prevLabel={p.prevText} />
        <ChannelsBlock d={d} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-[20px] font-semibold tabular-nums",
          strong ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[12px] tabular-nums text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---- C · Avval harakat --------------------------------------------------- */

type Signal = {
  key: string;
  level: "bad" | "warn" | "good" | "info";
  text: string;
  to?: string;
};

/** What needs a person first, worked out from the figures alone. */
function signalsOf(
  d: DeskData,
  t: ReturnType<typeof useI18n>["t"],
  format: (n: number) => string,
): Signal[] {
  const out: Signal[] = [];
  const plan = planOf(d);
  if (d.plan.team > 0 && plan.status === "behind") {
    out.push({
      key: "plan",
      level: "bad",
      text: t("homev.sig.planBehind", {
        forecast: format(plan.forecast),
        pct: plan.forecastPct ?? 0,
        v: format(plan.perDayNeeded),
      }),
    });
  }
  const todayDelta = change({ cur: d.today.revenue, prev: d.today.yRevenue });
  if (todayDelta != null && todayDelta <= -30) {
    out.push({
      key: "today",
      level: "warn",
      text: t("homev.sig.todayDown", { pct: Math.abs(todayDelta), v: format(d.today.yRevenue) }),
    });
  }
  for (const m of d.managers) {
    const mp = managerPlan(d, m);
    if (!(mp > 0)) continue;
    const prog = planProgress(mp, m.revenue.cur, d.plan.month);
    if (prog.status === "behind" && (prog.forecastPct ?? 0) < 80) {
      out.push({
        key: `m:${m.id}`,
        level: "warn",
        text: t("homev.sig.mgrBehind", {
          name: m.name,
          pct: prog.pct ?? 0,
          v: format(prog.perDayNeeded),
        }),
      });
    }
  }
  if (d.others.leads > 0) {
    out.push({
      key: "unassigned",
      level: "warn",
      text: t("homev.sig.unassigned", { n: d.others.leads }),
      to: "/funnels",
    });
  }
  const conv = change(d.conversion);
  if (conv != null && conv <= -15) {
    out.push({
      key: "conv",
      level: "warn",
      text: t("homev.sig.convDown", { pct: Math.abs(conv) }),
      to: "/lead-analytics",
    });
  }
  const rev = change(d.revenue);
  if (rev != null && rev >= 15) {
    out.push({ key: "rev", level: "good", text: t("homev.sig.revUp", { pct: rev }) });
  }
  if (d.plan.team > 0 && (plan.status === "on_track" || plan.status === "done")) {
    out.push({
      key: "planok",
      level: "good",
      text: t("homev.sig.planOk", { pct: plan.forecastPct ?? 0 }),
    });
  }
  if (!(d.plan.team > 0)) out.push({ key: "noplan", level: "info", text: t("homev.sig.noPlan") });
  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

const SIGNAL_LOOK = {
  bad: { icon: AlertTriangle, cls: "bg-rose-500/12 text-rose-600 dark:text-rose-300" },
  warn: { icon: AlertTriangle, cls: "bg-amber-500/14 text-amber-700 dark:text-amber-300" },
  info: { icon: Info, cls: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  good: { icon: CheckCircle2, cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
} as const;

export function VariantC(p: VariantProps) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { d } = p;
  const signals = signalsOf(d, t, format);
  const plan = planOf(d);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title={t("homev.attention")}
          icon={AlertTriangle}
          tone="rose"
          className="xl:col-span-2"
          actions={
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums text-muted-foreground">
              {signals.filter((s) => s.level === "bad" || s.level === "warn").length}
            </span>
          }
        >
          {signals.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-muted-foreground">
              {t("homev.allGood")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {signals.map((s) => {
                const look = SIGNAL_LOOK[s.level];
                return (
                  <li key={s.key} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                        look.cls,
                      )}
                    >
                      <look.icon className="h-[18px] w-[18px]" />
                    </span>
                    <p className="min-w-0 flex-1 text-[14px] leading-snug text-foreground">
                      {s.text}
                    </p>
                    {s.to && (
                      <Link
                        to={s.to}
                        className="ctl-soft inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold"
                      >
                        {t("homev.open")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <div className="grid gap-4">
          <Figure
            tipKey="desk.today"
            label={t("desk.today")}
            icon={Wallet}
            tone="emerald"
            value={format(d.today.revenue)}
            delta={change({ cur: d.today.revenue, prev: d.today.yRevenue })}
            sub={t("homev.yesterdayUntil", { time: d.today.until, v: format(d.today.yRevenue) })}
          />
          <Figure
            tipKey="desk.plan"
            label={t("desk.plan")}
            icon={Target}
            tone="amber"
            value={d.plan.team > 0 ? `${plan.pct ?? 0}%` : "—"}
            sub={
              d.plan.team > 0
                ? `${format(d.plan.fact)} / ${format(d.plan.team)}`
                : t("homev.noPlan")
            }
          >
            {d.plan.team > 0 && (
              <Bar
                pct={plan.pct ?? 0}
                tone={plan.status === "behind" ? "amber" : "emerald"}
                className="mt-3"
              />
            )}
          </Figure>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          tipKey="desk.revenue"
          label={p.revenueLabel}
          icon={Wallet}
          tone="primary"
          value={format(d.revenue.cur)}
          delta={change(d.revenue)}
        />
        <Figure
          tipKey="desk.count"
          label={t("desk.count")}
          icon={ShoppingCart}
          tone="sky"
          value={t("desk.pcs", { n: d.count.cur })}
          delta={change(d.count)}
        />
        <Figure
          tipKey="desk.avgCheck"
          label={t("desk.avgCheck")}
          icon={Wallet}
          tone="violet"
          value={format(d.avgCheck.cur)}
          delta={change(d.avgCheck)}
        />
        <Figure
          tipKey="desk.conversion"
          label={t("desk.conversion")}
          icon={Percent}
          tone="rose"
          value={`${d.conversion.cur}%`}
          delta={change(d.conversion)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("homev.race")} icon={Trophy} tone="amber">
          <ManagerRace d={d} />
        </Panel>
        <FunnelBlock d={d} onPick={p.onPickFunnel} />
      </div>
    </div>
  );
}

/* ---- D · Hisobot jadvali ------------------------------------------------- */

export function VariantD(p: VariantProps) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { d } = p;
  const plan = planOf(d);
  const rows: { label: string; cur: string; prev: string; delta: number | null; share?: number }[] =
    [
      {
        label: p.revenueLabel,
        cur: format(d.revenue.cur),
        prev: format(d.revenue.prev),
        delta: change(d.revenue),
      },
      {
        label: t("desk.count"),
        cur: String(d.count.cur),
        prev: String(d.count.prev),
        delta: change(d.count),
      },
      {
        label: t("desk.avgCheck"),
        cur: format(d.avgCheck.cur),
        prev: format(d.avgCheck.prev),
        delta: change(d.avgCheck),
      },
      {
        label: t("desk.leads"),
        cur: String(d.leads.cur),
        prev: String(d.leads.prev),
        delta: change(d.leads),
      },
      {
        label: t("desk.conversion"),
        cur: `${d.conversion.cur}%`,
        prev: `${d.conversion.prev}%`,
        delta: change(d.conversion),
      },
      {
        label: t("desk.newClients"),
        cur: String(d.newClients.cur),
        prev: String(d.newClients.prev),
        delta: change(d.newClients),
      },
      {
        label: t("desk.repeat"),
        cur: String(d.repeat.cur),
        prev: String(d.repeat.prev),
        delta: change(d.repeat),
      },
    ];
  const th =
    "px-5 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
  return (
    <div className="space-y-4">
      <section className={cn(CARD, "overflow-hidden")}>
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <Tile icon={Target} tone="primary" size="sm" />
          <h3 className="flex-1 text-[15px] font-semibold text-foreground">
            {t("homev.figuresTitle")}
          </h3>
          {d.plan.team > 0 && (
            <div className="flex w-[320px] items-center gap-3">
              <span className="whitespace-nowrap text-[13px] font-semibold text-muted-foreground">
                {t("desk.plan")}
              </span>
              <Bar
                pct={plan.pct ?? 0}
                tone={plan.status === "behind" ? "amber" : "emerald"}
                className="flex-1"
              />
              <span className="whitespace-nowrap text-[13px] font-bold tabular-nums text-foreground">
                {plan.pct ?? 0}%
              </span>
            </div>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface/60">
                <th className={th}>{t("homev.figure")}</th>
                <th className={cn(th, "text-right")}>{p.periodText}</th>
                <th className={cn(th, "text-right")}>{p.prevText}</th>
                <th className={cn(th, "text-right")}>{t("homev.diff")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.label}
                  className="border-b border-border/70 last:border-0 hover:bg-surface/60"
                >
                  <td className="px-5 py-3 font-medium text-foreground">{r.label}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-foreground">
                    {r.cur}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {r.prev}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Delta value={r.delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ManagersBlock d={d} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChannelsBlock d={d} />
        <SourcesBlock d={d} />
      </div>

      <DynamicsBlock d={d} curLabel={p.periodText} prevLabel={p.prevText} />
    </div>
  );
}
