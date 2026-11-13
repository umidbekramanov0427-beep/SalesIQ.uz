import { useMemo, useState } from "react";
import {
  CardTools,
  HiddenCard,
  cardStateClass,
  useCardChrome,
  valueStateClass,
} from "@/components/layout/CardTools";
import {
  AlarmClock,
  BarChart3,
  CalendarCheck2,
  Gauge,
  MessageSquareWarning,
  UserRound,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ListCard } from "@/components/layout/ListCard";
import { RefundMoneyLine } from "@/components/refunds/RefundList";
import { SectionCard } from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  groupRefunds,
  refundDue,
  refundSummary,
  refundTiming,
  weeklyRefunds,
  type RefundGroup,
  type RefundRow,
  type RefundRules,
} from "@/lib/refunds";

// Pul qaytarish -> Analitika. Top: how fast the company pays back (average
// days, share on time, what is late now, the average refund). Then the
// last eight weeks (asked vs paid back), the split before/after acceptance,
// and the reasons, managers and funnels as ranked lists (count, money, the
// part already paid back, and how many are late). Follows the filters.

type Ranked = RefundGroup & { late: number };

export function RefundAnalytics({
  rows,
  rules,
  funnelOf,
  operatorOf,
  nameOf,
}: {
  rows: RefundRow[];
  rules: RefundRules;
  funnelOf: (r: RefundRow) => string | null;
  operatorOf: (r: RefundRow) => string | null;
  nameOf: (id: string | null) => string;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const timing = useMemo(() => refundTiming(rows, rules), [rows, rules]);
  const weeks = useMemo(() => weeklyRefunds(rows, new Date()), [rows]);
  const withLate = useMemo(() => {
    const late = (keyOf: (r: RefundRow) => string | null) => {
      const m = new Map<string | null, number>();
      for (const r of rows)
        if (r.status === "pending" && refundDue(r, rules).kind === "overdue")
          m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + 1);
      return (g: RefundGroup): Ranked => ({ ...g, late: m.get(g.key) ?? 0 });
    };
    return {
      reasons: groupRefunds(rows, (r) => r.reason).map(late((r) => r.reason)),
      operators: groupRefunds(rows, operatorOf).map(late(operatorOf)),
      funnels: groupRefunds(rows, funnelOf).map(late(funnelOf)),
    };
  }, [rows, rules, funnelOf, operatorOf]);
  const active = rows.filter((r) => r.status !== "cancelled");
  const before = active.filter((r) => r.stage === "before");
  const after = active.filter((r) => r.stage === "after");
  const sumOf = (xs: RefundRow[]) => xs.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const sum = useMemo(() => refundSummary(rows), [rows]);

  return (
    <div className="space-y-4">
      <RefundMoneyLine sum={sum} />
      {/* How fast, how late. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Gauge}
          tone="sky"
          label={t("refund.anAvgDays")}
          value={timing.avgDays == null ? "—" : t("refund.anDaysN", { n: timing.avgDays })}
          hint={t("refund.anAvgDaysHint", { b: rules.beforeDays, a: rules.afterDays })}
        />
        <Kpi
          icon={CalendarCheck2}
          tone="emerald"
          label={t("refund.anOnTime")}
          value={timing.onTimePct == null ? "—" : `${timing.onTimePct}%`}
          meter={timing.onTimePct}
        />
        <Kpi
          icon={AlarmClock}
          tone={timing.overdue ? "rose" : "slate"}
          label={t("refund.anOverdue")}
          value={String(timing.overdue)}
          hint={timing.overdue ? format(timing.overdueAmount) : t("refund.anNoOverdue")}
          alert={timing.overdue > 0}
        />
        <Kpi
          icon={Wallet}
          tone="violet"
          label={t("refund.anAvgAmount")}
          value={format(timing.avgAmount)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard
          icon={BarChart3}
          tone="violet"
          title={t("refund.anWeeks")}
          description={t("refund.anWeeksDesc")}
        >
          <WeeksChart weeks={weeks} />
        </SectionCard>

        {/* Before vs after acceptance. */}
        <SectionCard
          icon={Workflow}
          tone="sky"
          title={t("refund.anStages")}
          description={t("refund.anStagesDesc")}
        >
          <div className="space-y-4">
            {(
              [
                ["before", before, "bg-sky-500"],
                ["after", after, "bg-violet-500"],
              ] as const
            ).map(([k, xs, bar]) => {
              const share = active.length ? Math.round((xs.length / active.length) * 100) : 0;
              const paid = xs.filter((r) => r.status === "refunded").length;
              return (
                <div key={k}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold text-foreground">
                      {t(`refund.stage.${k}`)}
                    </span>
                    <span className="text-[22px] font-bold tabular-nums text-foreground">
                      {share}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", bar)}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                    {t("refund.peopleN", { n: xs.length })} · {format(sumOf(xs))} ·{" "}
                    {t("refund.status.refunded")} {paid}/{xs.length}
                  </p>
                </div>
              );
            })}
            <p className="rounded-xl bg-surface px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("refund.anDeadlines", { b: rules.beforeDays, a: rules.afterDays })}
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RankCard
          icon={MessageSquareWarning}
          tone="rose"
          title={t("refund.anReasons")}
          description={t("refund.anReasonsDesc")}
          items={withLate.reasons}
          label={(g) => g.key ?? t("refund.noReason")}
          total={active.length}
        />
        <RankCard
          icon={UserRound}
          tone="sky"
          title={t("refund.anOperators")}
          description={t("refund.anOperatorsDesc")}
          items={withLate.operators}
          label={(g) => nameOf(g.key)}
          total={active.length}
        />
        <RankCard
          icon={Workflow}
          tone="emerald"
          title={t("refund.anFunnels")}
          description={t("refund.anFunnelsDesc")}
          items={withLate.funnels}
          label={(g) => g.key ?? t("refund.noFunnel")}
          total={active.length}
        />
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  meter,
  alert,
}: {
  icon: LucideIcon;
  tone: CardTone;
  label: string;
  value: string;
  hint?: string;
  meter?: number | null;
  alert?: boolean;
}) {
  const chrome = useCardChrome({ label, value });
  if (chrome.hidden) return <HiddenCard chrome={chrome} label={label} />;
  return (
    <div className={cn("surface-card flex items-start gap-3.5 p-4", cardStateClass(chrome.state))}>
      <span
        className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", TONE_TILE[tone])}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <CardTools chrome={chrome} label={label} text={hint} />
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-[24px] font-bold leading-tight tracking-tight tabular-nums",
            alert ? "text-rose-600 dark:text-rose-400" : "text-foreground",
            valueStateClass(chrome.state),
          )}
        >
          {value}
        </p>
        {meter != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${meter}%` }} />
          </div>
        )}
        {hint && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function WeeksChart({ weeks }: { weeks: { week: string; requested: number; refunded: number }[] }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.requested, w.refunded)));
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = step * Math.ceil(max / step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).reverse();
  const label = (w: string) => w.slice(5).split("-").reverse().join(".");
  return (
    <div>
      <div className="relative flex h-[190px] gap-3">
        {/* Y axis + grid */}
        <div className="flex flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-subtle">
          {ticks.map((v) => (
            <span key={v} className="-translate-y-1.5 leading-none">
              {v}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((v) => (
            <div
              key={v}
              className="absolute inset-x-0 border-t border-dashed border-border/80"
              style={{ bottom: `${(v / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1.5">
            {weeks.map((w, i) => (
              <div
                key={w.week}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  "relative flex h-full flex-1 items-end justify-center gap-[3px] rounded-md transition-colors",
                  hover === i && "bg-accent/60",
                )}
              >
                {hover === i && (
                  <span className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] text-foreground shadow-md">
                    <b>{label(w.week)}</b> · {t("refund.anRequested")} {w.requested} ·{" "}
                    {t("refund.status.refunded")} {w.refunded}
                  </span>
                )}
                <div
                  className="w-[34%] max-w-[16px] rounded-t-[4px] bg-amber-400"
                  style={{
                    height: `${(w.requested / top) * 100}%`,
                    minHeight: w.requested ? 3 : 0,
                  }}
                />
                <div
                  className="w-[34%] max-w-[16px] rounded-t-[4px] bg-emerald-500"
                  style={{ height: `${(w.refunded / top) * 100}%`, minHeight: w.refunded ? 3 : 0 }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-7 mt-2 flex gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        {weeks.map((w) => (
          <span key={w.week} className="flex-1 text-center">
            {label(w.week)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[12.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> {t("refund.anRequested")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {t("refund.status.refunded")}
        </span>
      </div>
    </div>
  );
}

function RankCard({
  icon,
  tone,
  title,
  description,
  items,
  label,
  total,
}: {
  icon: LucideIcon;
  tone: CardTone;
  title: string;
  description: string;
  items: Ranked[];
  label: (g: Ranked) => string;
  total: number;
}) {
  return (
    <ListCard<Ranked>
      icon={icon}
      tone={tone}
      title={title}
      description={description}
      items={items}
      searchText={label}
      renderRow={(g, i) => (
        <RankLine key={g.key ?? "—"} n={i + 1} g={g} label={label(g)} total={total} />
      )}
    />
  );
}

function RankLine({ n, g, label, total }: { n: number; g: Ranked; label: string; total: number }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const share = total ? Math.round((g.count / total) * 100) : 0;
  const paidPct = g.count ? (g.refunded / g.count) * 100 : 0;
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold tabular-nums",
          n === 1 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-foreground">{label}</span>
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
            {g.count}
            <span className="ml-1 font-normal text-muted-foreground">· {share}%</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-400/30">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
        </div>
        <p className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
          <span className="tabular-nums">{format(g.amount)}</span>
          <span>
            · {t("refund.status.refunded")} {g.refunded}/{g.count}
          </span>
          {g.late > 0 && (
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              · {t("refund.anLateN", { n: g.late })}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
