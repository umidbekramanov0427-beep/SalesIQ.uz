import { useId, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftRight,
  ChartPie,
  PhoneCall,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { RailGlyph } from "@/components/layout/RailGlyph";
import { InfoTip } from "@/components/layout/Primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeOverview, useTodayTasks } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import type { HomeOverview as Overview, Kpi } from "@/lib/home-overview";
import type { DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { datePresetRange } from "@/lib/date-presets";
import { cn } from "@/lib/utils";

// Bosh sahifa's overview, as in the approved mock-up: a greeting header with
// the period switch, six KPI cards (each with the change against the period
// before and a small trend line), revenue by day with the deals under it,
// today's tasks, task discipline and the call types.

const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

const WEEKDAYS_UZ = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];

function greetingKey(h: number) {
  if (h >= 5 && h < 11) return "home2.morning";
  if (h >= 11 && h < 17) return "home2.day";
  if (h >= 17 && h < 23) return "home2.evening";
  return "home2.night";
}

/** "Payshanba, 29-oktabr" / "четверг, 29 октября" / "Thursday, 29 October". */
function longDate(d: Date, lang: string) {
  if (lang === "uz") {
    return `${WEEKDAYS_UZ[d.getDay()]}, ${d.getDate()}-${MONTHS_UZ[d.getMonth()]}`;
  }
  const s = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function GreetingHeader({
  orgName,
  actions,
}: {
  orgName?: string | undefined;
  actions: ReactNode;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const now = new Date();
  const first = (user?.name ?? "").split(" ")[0];
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] text-muted-foreground">
          {longDate(now, lang)}
          {orgName ? ` · ${orgName}` : ""}
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-tight text-foreground phone:text-[22px]">
          {t(greetingKey(now.getHours()))}
          {first ? `, ${first}` : ""}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
    </div>
  );
}

const SEGMENTS = [
  { key: "today", label: "home2.segToday" },
  { key: "7d", label: "home2.segWeek" },
  { key: "month", label: "home2.segMonth" },
  { key: "year", label: "home2.segYear" },
] as const;

/** Bugun / Hafta / Oy / Yil -- shortcuts for the page's date filter. */
export function PeriodSegment({
  value,
  onChange,
}: {
  value: DateFilterValue;
  onChange: (v: DateFilterValue) => void;
}) {
  const { t } = useI18n();
  const active = value.preset ?? (value.from || value.to ? "custom" : "month");
  return (
    <div className="phone-tabs inline-flex h-11 items-center gap-0.5 rounded-xl border border-border bg-surface p-1">
      {SEGMENTS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => {
            const r = datePresetRange(s.key);
            onChange({
              from: r?.from ?? null,
              to: r?.to ?? null,
              label: t(s.label),
              preset: s.key,
            });
          }}
          className={cn(
            "h-full rounded-lg px-3.5 text-[13px] font-semibold transition-colors",
            active === s.key || (s.key === "month" && active === "all")
              ? "bg-accent text-foreground shadow-soft"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(s.label)}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- KPIs */

type Tone = { icon: string; bg: string; line: string };
const TONES: Record<string, Tone> = {
  blue: { icon: "text-blue-500", bg: "bg-blue-500/12", line: "#3b82f6" },
  green: { icon: "text-emerald-500", bg: "bg-emerald-500/12", line: "#34d399" },
  amber: { icon: "text-amber-500", bg: "bg-amber-500/12", line: "#f59e0b" },
  sky: { icon: "text-sky-500", bg: "bg-sky-500/12", line: "#38bdf8" },
  violet: { icon: "text-violet-500", bg: "bg-violet-500/12", line: "#a78bfa" },
  pink: { icon: "text-pink-500", bg: "bg-pink-500/12", line: "#f472b6" },
};

function Sparkline({ series, color }: { series: (number | null)[]; color: string }) {
  const id = useId().replace(/:/g, "");
  const pts = series.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [
    number,
    number,
  ][];
  if (pts.length < 2) return <span className="h-[30px] w-[92px]" />;
  const w = 92;
  const h = 30;
  const xs = pts.map(([i]) => i);
  const ys = pts.map(([, v]) => v);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  const minY = Math.min(...ys);
  const spanY = Math.max(...ys) - minY || 1;
  const p: [number, number][] = pts.map(([i, v]) => [
    ((i - minX) / spanX) * w,
    h - 3 - ((v - minY) / spanY) * (h - 8),
  ]);
  let d = `M${p[0]![0]},${p[0]![1]}`;
  for (let k = 0; k < p.length - 1; k++) {
    const a = p[k - 1] ?? p[k]!;
    const b = p[k]!;
    const c = p[k + 1]!;
    const e = p[k + 2] ?? c;
    const c1y = Math.min(h - 1, b[1] + (c[1] - a[1]) / 6);
    const c2y = Math.min(h - 1, c[1] - (e[1] - b[1]) / 6);
    d += ` C${b[0] + (c[0] - a[0]) / 6},${c1y} ${c[0] - (e[0] - b[0]) / 6},${c2y} ${c[0]},${c[1]}`;
  }
  const last = p[p.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#sp${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

function DeltaPill({ kpi, lowerIsBetter }: { kpi: Kpi; lowerIsBetter?: boolean | undefined }) {
  if (kpi.deltaPct == null) return <span className="text-xs text-subtle">—</span>;
  if (kpi.deltaPct === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        0%
      </span>
    );
  }
  const up = kpi.deltaPct >= 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        good ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(kpi.deltaPct)}%
    </span>
  );
}

function KpiCard({
  icon,
  tone,
  label,
  value,
  sub,
  kpi,
  lowerIsBetter,
  info,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  sub: string;
  kpi: Kpi;
  lowerIsBetter?: boolean | undefined;
  info?: string;
}) {
  const { t } = useI18n();
  const c = TONES[tone]!;
  return (
    <div className="surface-card group flex min-w-0 flex-col p-3.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)]">
      <div className="flex items-center gap-2.5">
        <span
          className={cn("grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]", c.bg)}
        >
          <RailGlyph icon={icon} className={cn("h-[19px] w-[19px]", c.icon)} />
        </span>
        <span className="min-w-0 flex-1 text-[10.5px] font-bold uppercase leading-tight tracking-[0.07em] text-muted-foreground">
          {label}
        </span>
        {info && <InfoTip text={info} />}
      </div>
      <p className="mt-3 truncate font-display text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[11.5px] text-subtle">{sub}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <DeltaPill kpi={kpi} lowerIsBetter={lowerIsBetter} />
        <Sparkline series={kpi.series} color={c.line} />
      </div>
      <p className="mt-1.5 text-[11px] text-subtle">{t("home2.vsPrev")}</p>
    </div>
  );
}

const fmt1 = (n: number | null, lang: string) =>
  n == null
    ? "—"
    : n.toLocaleString(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 1 });

function KpiGrid({ o }: { o: Overview }) {
  const { t, lang } = useI18n();
  const { formatCompact } = useCurrency();
  return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={Users}
        tone="blue"
        label={t("home2.kpiLeads")}
        value={String(o.newLeads.value ?? 0)}
        sub={t("home2.kpiLeadsSub")}
        kpi={o.newLeads}
        info={t("home2.kpiLeadsInfo")}
      />
      <KpiCard
        icon={Wallet}
        tone="green"
        label={t("home2.kpiRevenue")}
        value={formatCompact(o.revenue.value ?? 0, lang)}
        sub={t("home2.kpiRevenueSub", { n: o.revenue.deals })}
        kpi={o.revenue}
        info={t("home2.kpiRevenueInfo")}
      />
      <KpiCard
        icon={Timer}
        tone="amber"
        label={t("home2.kpiFirstContact")}
        value={
          o.firstContactHours.value == null
            ? "—"
            : o.firstContactHours.value < 1
              ? t("home2.minutes", { n: Math.round(o.firstContactHours.value * 60) })
              : t("home2.hours", { n: fmt1(o.firstContactHours.value, lang) })
        }
        sub={t("home2.kpiFirstContactSub")}
        kpi={o.firstContactHours}
        lowerIsBetter
        info={t("home2.kpiFirstContactInfo")}
      />
      <KpiCard
        icon={PhoneCall}
        tone="sky"
        label={t("home2.kpiAttempts")}
        value={fmt1(o.attemptsToContact.value, lang)}
        sub={t("home2.kpiAttemptsSub")}
        kpi={o.attemptsToContact}
        lowerIsBetter
        info={t("home2.kpiAttemptsInfo")}
      />
      <KpiCard
        icon={ArrowLeftRight}
        tone="violet"
        label={t("home2.kpiCycle")}
        value={
          o.leadToSaleDays.value == null
            ? "—"
            : t("home2.days", { n: fmt1(o.leadToSaleDays.value, lang) })
        }
        sub={t("home2.kpiCycleSub")}
        kpi={o.leadToSaleDays}
        lowerIsBetter
        info={t("home2.kpiCycleInfo")}
      />
      <KpiCard
        icon={ChartPie}
        tone="pink"
        label={t("home2.kpiConversion")}
        value={o.conversion.value == null ? "—" : `${fmt1(o.conversion.value, lang)}%`}
        sub={t("home2.kpiConversionSub", { sold: o.conversion.sold, leads: o.conversion.leads })}
        kpi={o.conversion}
        info={t("home2.kpiConversionInfo")}
      />
    </div>
  );
}

/* --------------------------------------------------------- revenue chart */

function RevenueChart({ o }: { o: Overview }) {
  const { t, lang } = useI18n();
  const { format, formatCompact } = useCurrency();
  // Over two months a day is too thin a bar: group by week.
  const data = useMemo(() => {
    const days = o.daily;
    if (days.length <= 62) return days;
    const weeks: typeof days = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push({
        date: chunk[0]!.date,
        revenue: chunk.reduce((s, d) => s + d.revenue, 0),
        deals: chunk.reduce((s, d) => s + d.deals, 0),
      });
    }
    return weeks;
  }, [o.daily]);
  const label = (iso: string) => {
    const d = new Date(iso);
    return lang === "uz"
      ? `${d.getDate()}-${MONTHS_UZ[d.getMonth()]!.slice(0, 3)}`
      : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const tick = (iso: string) => String(new Date(iso).getDate());
  return (
    <div className="surface-card flex min-w-0 flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">{t("home2.revenueTitle")}</h3>
          <p className="mt-0.5 text-[12.5px] text-subtle">{t("home2.revenueDesc")}</p>
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-[3px] w-2.5 rounded-full bg-[#5b8cff]" />
            {t("home2.legendRevenue")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-violet-500" />
            {t("home2.legendDeals")}
          </span>
        </div>
      </div>
      <div className="mt-3 h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 6, bottom: 0, left: 0 }}
            syncId="home-rev"
          >
            <defs>
              <linearGradient id="home-rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3570ee" stopOpacity={0.35} />
                <stop offset="1" stopColor="#3570ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
            <XAxis dataKey="date" hide scale="point" padding={{ left: 6, right: 6 }} />
            <YAxis
              width={72}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--subtle)", fontSize: 11 }}
              tickFormatter={(v: number) => (v ? formatCompact(v, lang) : "0")}
            />
            <Tooltip
              cursor={{ stroke: "#5b8cff", strokeDasharray: "3 3", strokeOpacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active
                  ? (payload?.[0]?.payload as (typeof data)[number] | undefined)
                  : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-xl border border-popover-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
                    <p className="text-[11px] text-muted-foreground">{label(p.date)}</p>
                    <p className="text-sm font-bold tabular-nums">{format(p.revenue)}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {t("home2.dealsN", { n: p.deals })}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#5b8cff"
              strokeWidth={2.4}
              fill="url(#home-rev-fill)"
              dot={false}
              activeDot={{ r: 5, fill: "#5b8cff", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="h-[86px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} syncId="home-rev">
            <XAxis
              dataKey="date"
              scale="point"
              padding={{ left: 6, right: 6 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--subtle)", fontSize: 10.5 }}
              tickFormatter={tick}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis
              width={72}
              tick={false}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.35 }} content={() => null} />
            <Bar
              dataKey="deals"
              fill="#8b7cf6"
              radius={[3, 3, 0, 0]}
              barSize={10}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- today */

function TodayColumn() {
  const { t } = useI18n();
  const { data, isLoading } = useTodayTasks(6);
  const now = Date.now();
  const tasks = data?.tasks ?? [];
  const overdue = tasks.filter((x) => new Date(x.due_date).getTime() < now).length;
  return (
    <div className="surface-card flex min-w-0 flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">{t("home2.todayTitle")}</h3>
        {overdue > 0 && (
          <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">
            {t("home2.overdueN", { n: overdue })}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[12.5px] text-subtle">
        {t("home2.todaySub", { n: data?.total ?? 0 })}
      </p>
      <div className="mt-2 flex-1">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="grid h-full min-h-[160px] place-items-center text-center text-sm text-subtle">
            {t("home2.todayEmpty")}
          </p>
        ) : (
          tasks.map((x) => {
            const due = new Date(x.due_date);
            const late = due.getTime() < now;
            const sameDay = due.toDateString() === new Date().toDateString();
            const who = x.lead?.name || x.lead?.company_name || x.title;
            const body = (
              <>
                <span
                  className={cn(
                    "w-11 shrink-0 pt-0.5 font-mono text-xs tabular-nums",
                    late ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {sameDay
                    ? due.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                    : `${due.getDate()}.${String(due.getMonth() + 1).padStart(2, "0")}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {who}
                  </span>
                  <span className="block truncate text-xs text-subtle">{x.title}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    late
                      ? "bg-destructive/12 text-destructive"
                      : "bg-primary/12 text-[var(--primary-ink)]",
                  )}
                >
                  {late ? t("home2.late") : t("home2.today")}
                </span>
              </>
            );
            return x.lead_id ? (
              <Link
                key={x.id}
                to="/crm/leads/$leadId"
                params={{ leadId: x.lead_id }}
                search={{ from: "funnels" }}
                className="flex items-start gap-3 border-t border-border py-2.5 transition-colors first:border-t-0 hover:bg-accent/40"
              >
                {body}
              </Link>
            ) : (
              <div
                key={x.id}
                className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0"
              >
                {body}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ task discipline */

function DisciplineTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub: string;
  className: string;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-surface p-3.5">
      <p className="truncate text-xs text-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-[30px] font-bold leading-tight tabular-nums",
          className,
        )}
      >
        {value}
      </p>
      <p className="truncate text-[11.5px] text-subtle">{sub}</p>
    </div>
  );
}

function TaskDiscipline({ o }: { o: Overview }) {
  const { t } = useI18n();
  const x = o.tasks;
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  return (
    <div className="surface-card min-w-0 p-5">
      <h3 className="text-base font-bold text-foreground">{t("home2.discTitle")}</h3>
      <p className="mt-0.5 text-[12.5px] text-subtle">{t("home2.discDesc")}</p>
      <div className="mt-4 grid grid-cols-3 gap-3 phone:grid-cols-1">
        <DisciplineTile
          label={t("home2.discWithTask")}
          value={pct(x.leadsWithTaskPct)}
          sub={t("home2.discWithTaskSub", { a: x.leadsWithTask, b: x.openLeads })}
          className="text-[var(--primary-ink)]"
        />
        <DisciplineTile
          label={t("home2.discOnTime")}
          value={pct(x.onTimePct)}
          sub={t("home2.discOnTimeSub", { a: x.onTime, b: x.done })}
          className="text-success"
        />
        <DisciplineTile
          label={t("home2.discOverdue")}
          value={pct(x.overduePct)}
          sub={t("home2.discOverdueSub", { n: x.overdue })}
          className="text-destructive"
        />
      </div>
      <p className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-subtle">
        <span>
          {t("home2.discTotal")} <b className="text-foreground">{x.total}</b>
        </span>
        <span>
          {t("home2.discDone")} <b className="text-foreground">{x.done}</b>
        </span>
        <span>
          {t("home2.discOpen")} <b className="text-foreground">{x.open}</b>
        </span>
        <span>
          {t("home2.discOverdue")} <b className="text-destructive">{x.overdue}</b>
        </span>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- call types */

function CallTypes({ o }: { o: Overview }) {
  const { t } = useI18n();
  const c = o.callTypes;
  const parts = [
    { key: "repeat", label: t("home2.ctRepeat"), n: c.repeat, color: "#5b8cff" },
    { key: "first", label: t("home2.ctFirst"), n: c.first, color: "#8b7cf6" },
    { key: "other", label: t("home2.ctOther"), n: c.other, color: "#e8a93a" },
  ];
  const r = 52;
  const circ = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="surface-card min-w-0 p-5">
      <h3 className="text-base font-bold text-foreground">{t("home2.ctTitle")}</h3>
      <p className="mt-0.5 text-[12.5px] text-subtle">{t("home2.ctDesc")}</p>
      <div className="mt-3 flex items-center gap-6 phone:flex-col phone:items-stretch">
        <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0 self-center">
          <circle r={r} cx="70" cy="70" fill="none" stroke="var(--muted)" strokeWidth="18" />
          {c.total > 0 &&
            parts.map((p) => {
              const seg = (circ * p.n) / c.total;
              const el = (
                <circle
                  key={p.key}
                  r={r}
                  cx="70"
                  cy="70"
                  fill="none"
                  stroke={p.color}
                  strokeWidth="18"
                  strokeDasharray={`${Math.max(0, seg - (p.n ? 3 : 0))} ${circ}`}
                  strokeDashoffset={-off}
                  transform="rotate(-90 70 70)"
                />
              );
              off += seg;
              return el;
            })}
          <text
            x="70"
            y="68"
            textAnchor="middle"
            className="fill-foreground"
            fontSize="22"
            fontWeight="700"
          >
            {c.total}
          </text>
          <text
            x="70"
            y="86"
            textAnchor="middle"
            className="fill-[var(--muted-foreground)]"
            fontSize="11"
          >
            {t("home2.ctCalls")}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          {parts.map((p) => (
            <div key={p.key} className="flex items-center gap-2.5 py-1.5">
              <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
                {p.label}
              </span>
              <span className="w-10 text-right text-[12.5px] tabular-nums text-subtle">
                {c.total ? Math.round((p.n / c.total) * 100) : 0}%
              </span>
              <b className="w-12 text-right tabular-nums text-foreground">{p.n}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- the page */

export function HomeOverviewSection({
  range,
  prevRange,
  funnel,
  ownerIds,
}: {
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
  funnel: string | null;
  ownerIds: string[] | null;
}) {
  const { overview, isLoading } = useHomeOverview(range, prevRange, { funnel, ownerIds });
  if (isLoading || !overview) {
    return (
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[178px] rounded-[var(--radius)]" />
          ))}
        </div>
        <Skeleton className="h-[360px] w-full rounded-[var(--radius)]" />
      </div>
    );
  }
  return (
    <div className="space-y-3.5">
      <KpiGrid o={overview} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RevenueChart o={overview} />
        <TodayColumn />
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <TaskDiscipline o={overview} />
        <CallTypes o={overview} />
      </div>
    </div>
  );
}
