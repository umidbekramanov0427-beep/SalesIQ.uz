import { useId, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftRight,
  CircleGauge,
  ChartBarBig,
  ChartColumn,
  ChartPie,
  ChartSpline,
  LayoutGrid,
  ListOrdered,
  PhoneCall,
  RectangleHorizontal,
  Table2,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  CardSettingsButton,
  OptionList,
  SettingSection,
  TargetInput,
  ToggleRow,
  ViewPicker,
} from "@/components/dashboard/CardSettings";
import { useCardSettings, type CardView } from "@/lib/home-card-settings";
import {
  METRIC_FORMULAS,
  computeMetric,
  defaultFormula,
  formulaUnit,
  isFormula,
  lowerIsBetter,
  metricByOwner,
  type MetricId,
  type MetricInput,
  type Unit,
} from "@/lib/home-metrics";
import { RailGlyph } from "@/components/layout/RailGlyph";
import { InfoTip } from "@/components/layout/Primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useFunnelStats,
  useHomeOverview,
  useProfilesRaw,
  useTodayTasks,
  type StatsScope,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { deltaPct, type HomeOverview as Overview, type Kpi } from "@/lib/home-overview";
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

const fmt1 = (n: number | null, lang: string) =>
  n == null
    ? "—"
    : n.toLocaleString(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 1 });

type Conversion = Kpi & { sold: number; leads: number; allTime: boolean };

/**
 * Konversiya exactly as the dashboard always counted it (useFunnelStats):
 * leads created in the picked dates that now sit in a sales stage, out of
 * all leads created then -- all time when no dates are picked. The change
 * is against the same-length span just before; none for all time.
 */
function useClassicConversion(
  funnel: string | null,
  scope: StatsScope,
  series: (number | null)[],
): Conversion | null {
  const prevScope = useMemo<StatsScope>(() => {
    if (!scope.from || !scope.to) return scope;
    const span = scope.to.getTime() - scope.from.getTime();
    return {
      ownerIds: scope.ownerIds ?? null,
      from: new Date(scope.from.getTime() - span),
      to: scope.from,
    };
  }, [scope]);
  const cur = useFunnelStats(funnel, scope);
  const prev = useFunnelStats(funnel, prevScope);
  if (cur.isLoading) return null;
  const value = cur.totalLeads ? cur.conversion : null;
  const prevValue =
    prevScope !== scope && !prev.isLoading && prev.totalLeads ? prev.conversion : null;
  return {
    value,
    prev: prevValue,
    deltaPct: deltaPct(value, prevValue),
    series,
    sold: cur.salesStageCount,
    leads: cur.totalLeads,
    allTime: !scope.from && !scope.to,
  };
}

/** A number in the unit its formula measures. */
function useFormatUnit() {
  const { t, lang } = useI18n();
  const { formatCompact } = useCurrency();
  return (unit: Unit, v: number | null): string => {
    if (v == null) return "—";
    switch (unit) {
      case "count":
        return String(Math.round(v));
      case "money":
        return formatCompact(v, lang);
      case "hours":
        return v < 1
          ? t("home2.minutes", { n: Math.round(v * 60) })
          : t("home2.hours", { n: fmt1(v, lang) });
      case "times":
        return fmt1(v, lang);
      case "days":
        return t("home2.days", { n: fmt1(v, lang) });
      case "pct":
        return `${fmt1(v, lang)}%`;
    }
  };
}

const UNIT_KEY: Record<Unit, string> = {
  count: "cardset.unit.count",
  money: "cardset.unit.money",
  hours: "cardset.unit.hours",
  times: "cardset.unit.times",
  days: "cardset.unit.days",
  pct: "cardset.unit.pct",
};

const MS_DAY = 24 * 60 * 60 * 1000;
const shortDate = (fromMs: number, i: number, lang: string) => {
  const d = new Date(fromMs + i * MS_DAY);
  return lang === "uz"
    ? `${d.getDate()}-${MONTHS_UZ[d.getMonth()]!.slice(0, 3)}`
    : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** The goal's progress: 1 = reached. Lower-is-better goals invert. */
function targetProgress(value: number | null, target: number, low: boolean) {
  if (value == null) return { met: false, ratio: 0 };
  if (low) return { met: value <= target, ratio: value ? Math.min(1, target / value) : 1 };
  return { met: value >= target, ratio: target ? Math.min(1, value / target) : 1 };
}

type MetricDef = {
  id: MetricId;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  info: string;
  /** The card's number for its default formula (what it always showed). */
  base: Kpi;
  /** Sub line for the default formula. */
  baseSub: string;
  baseFoot?: string | undefined;
};

function MetricCard({
  def,
  input,
  range,
  prevRange,
}: {
  def: MetricDef;
  input: MetricInput;
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
}) {
  const { t } = useI18n();
  const fmtUnit = useFormatUnit();
  const { data: profiles } = useProfilesRaw();
  const { settings, update, reset, changed } = useCardSettings(`kpi.${def.id}`);
  const formula = isFormula(def.id, settings.formula) ? settings.formula! : defaultFormula(def.id);
  const isDefault = formula === defaultFormula(def.id);
  const view = (["card", "chart", "list"] as const).includes(settings.view as CardView)
    ? (settings.view as CardView)
    : "card";
  const compare = settings.compare ?? true;
  const target = settings.target ?? null;
  const unit = formulaUnit(def.id, formula);
  const low = lowerIsBetter(def.id, formula);
  const kpi = useMemo(
    () => (isDefault ? def.base : computeMetric(def.id, formula, input, range, prevRange)),
    [isDefault, def.base, def.id, formula, input, range, prevRange],
  );
  const owners = useMemo(
    () => (view === "list" ? metricByOwner(def.id, formula, input, range) : []),
    [view, def.id, formula, input, range],
  );
  const names = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
    [profiles],
  );
  const c = TONES[def.tone]!;
  const goal = target != null ? targetProgress(kpi.value, target, low) : null;
  const fKey = `cardset.f.${def.id}.${formula}`;
  const sub = isDefault ? def.baseSub : t(`${fKey}.sub`);
  const value = fmtUnit(unit, kpi.value);
  const valueClass = goal ? (goal.met ? "text-success" : "text-destructive") : "text-foreground";

  const settingsPanel = (
    <CardSettingsButton title={def.label} changed={changed} onReset={reset} className="h-6 w-6">
      <SettingSection label={t("cardset.formula")}>
        <OptionList
          value={formula}
          onChange={(v) => update({ formula: v === defaultFormula(def.id) ? undefined : v })}
          options={METRIC_FORMULAS[def.id].map((f) => ({
            value: f as string,
            label: t(`cardset.f.${def.id}.${f}`),
            desc: t(`cardset.f.${def.id}.${f}.desc`),
          }))}
        />
      </SettingSection>
      <SettingSection label={t("cardset.view")}>
        <ViewPicker
          value={view}
          onChange={(v) => update({ view: v === "card" ? undefined : v })}
          options={[
            { value: "card", label: t("cardset.view.card"), icon: RectangleHorizontal },
            { value: "chart", label: t("cardset.view.chart"), icon: ChartColumn },
            { value: "list", label: t("cardset.view.people"), icon: ListOrdered },
          ]}
        />
      </SettingSection>
      <SettingSection
        label={t("cardset.rule")}
        hint={t(low ? "cardset.targetLow" : "cardset.targetHigh")}
      >
        <TargetInput
          key={target ?? "none"}
          value={target}
          unit={t(UNIT_KEY[unit])}
          onChange={(v) => update({ target: v })}
        />
        <div className="mt-3">
          <ToggleRow
            label={t("cardset.compare")}
            hint={t("cardset.compareHint")}
            checked={compare}
            onChange={(v) => update({ compare: v ? undefined : false })}
          />
        </div>
      </SettingSection>
    </CardSettingsButton>
  );

  const goalBar = goal && (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", goal.met ? "bg-success" : "bg-destructive")}
          style={{ width: `${Math.round(goal.ratio * 100)}%` }}
        />
      </div>
      <p className="mt-1 truncate text-[11px] text-subtle">
        {t("cardset.goalLine", { v: fmtUnit(unit, target), p: Math.round(goal.ratio * 100) })}
      </p>
    </div>
  );

  return (
    <div className="surface-card group relative flex min-w-0 flex-col p-3.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)]">
      {/* The card's own settings sit in its corner, so the name keeps its width. */}
      <div className="absolute right-1.5 top-1.5">{settingsPanel}</div>
      <div className="flex items-center gap-2.5 pr-5">
        <span
          className={cn("grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]", c.bg)}
        >
          <RailGlyph icon={def.icon} className={cn("h-[19px] w-[19px]", c.icon)} />
        </span>
        <span className="min-w-0 flex-1 text-[10.5px] font-bold uppercase leading-tight tracking-[0.07em] text-muted-foreground">
          {def.label}
          <span className="ml-1 inline-flex align-[-2px]">
            <InfoTip text={isDefault ? def.info : t(`${fKey}.desc`)} />
          </span>
        </span>
      </div>
      <p
        className={cn(
          "truncate font-display font-bold leading-none tracking-tight tabular-nums",
          view === "card" ? "mt-3 text-[26px]" : "mt-2.5 text-[21px]",
          valueClass,
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 truncate text-[11.5px] text-subtle">{sub}</p>
      {goalBar}

      {view === "card" && (
        <>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            {compare ? <DeltaPill kpi={kpi} lowerIsBetter={low} /> : <span />}
            <Sparkline series={kpi.series} color={c.line} />
          </div>
          {compare && (
            <p className="mt-1.5 text-[11px] text-subtle">
              {isDefault && def.baseFoot ? def.baseFoot : t("home2.vsPrev")}
            </p>
          )}
        </>
      )}

      {view === "chart" && (
        <>
          <MiniChart
            series={kpi.series}
            color={c.line}
            bars={unit === "count" || (unit === "money" && formula === "sum")}
            fromMs={range.from.getTime()}
            format={(v) => fmtUnit(unit, v)}
          />
          {compare && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-subtle">
              <DeltaPill kpi={kpi} lowerIsBetter={low} />
              <span className="truncate">{t("home2.vsPrev")}</span>
            </div>
          )}
        </>
      )}

      {view === "list" && (
        <div className="mt-2.5 min-h-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-subtle">
            {t("cardset.byPeople")}
          </p>
          {owners.length === 0 ? (
            <p className="mt-1.5 text-[11.5px] text-subtle">{t("cardset.noPeople")}</p>
          ) : (
            <ol className="mt-1 max-h-[132px] space-y-0.5 overflow-y-auto pr-0.5">
              {owners.map((o, i) => (
                <li key={o.ownerId} className="flex items-center gap-1.5 text-[12px] leading-6">
                  <span className="w-4 shrink-0 text-right tabular-nums text-subtle">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {names.get(o.ownerId) ?? "—"}
                  </span>
                  <b
                    className={cn(
                      "shrink-0 tabular-nums",
                      target != null
                        ? targetProgress(o.value, target, low).met
                          ? "text-success"
                          : "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {fmtUnit(unit, o.value)}
                  </b>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** The chart view of a KPI card: its per-day values as bars or a line. */
function MiniChart({
  series,
  color,
  bars,
  fromMs,
  format,
}: {
  series: (number | null)[];
  color: string;
  bars: boolean;
  fromMs: number;
  format: (v: number | null) => string;
}) {
  const { lang } = useI18n();
  const id = useId().replace(/:/g, "");
  const data = series.map((v, i) => ({ i, v }));
  const tip = (
    <Tooltip
      cursor={{ fill: "var(--accent)", opacity: 0.4 }}
      content={({ active, payload }) => {
        const p = active ? (payload?.[0]?.payload as { i: number; v: number | null }) : undefined;
        if (!p) return null;
        return (
          <div className="rounded-lg border border-popover-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md">
            <p className="text-[10.5px] text-muted-foreground">{shortDate(fromMs, p.i, lang)}</p>
            <p className="text-[12.5px] font-bold tabular-nums">{format(p.v)}</p>
          </div>
        );
      }}
    />
  );
  return (
    <div className="mt-2.5 h-[78px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {bars ? (
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="i" hide />
            <YAxis hide />
            {tip}
            <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <ComposedChart data={data} margin={{ top: 6, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={`mc${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.3} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["auto", "auto"]} />
            {tip}
            <Area
              type="monotone"
              dataKey="v"
              connectNulls
              stroke={color}
              strokeWidth={2}
              fill={`url(#mc${id})`}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function KpiGrid({
  o,
  conversion,
  input,
  range,
  prevRange,
}: {
  o: Overview;
  conversion: Conversion;
  input: MetricInput;
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
}) {
  const { t } = useI18n();
  const defs: MetricDef[] = [
    {
      id: "newLeads",
      icon: Users,
      tone: "blue",
      label: t("home2.kpiLeads"),
      info: t("home2.kpiLeadsInfo"),
      base: o.newLeads,
      baseSub: t("home2.kpiLeadsSub"),
    },
    {
      id: "revenue",
      icon: Wallet,
      tone: "green",
      label: t("home2.kpiRevenue"),
      info: t("home2.kpiRevenueInfo"),
      base: o.revenue,
      baseSub: t("home2.kpiRevenueSub", { n: o.revenue.deals }),
    },
    {
      id: "firstContact",
      icon: Timer,
      tone: "amber",
      label: t("home2.kpiFirstContact"),
      info: t("home2.kpiFirstContactInfo"),
      base: o.firstContactHours,
      baseSub: t("home2.kpiFirstContactSub"),
    },
    {
      id: "attempts",
      icon: PhoneCall,
      tone: "sky",
      label: t("home2.kpiAttempts"),
      info: t("home2.kpiAttemptsInfo"),
      base: o.attemptsToContact,
      baseSub: t("home2.kpiAttemptsSub"),
    },
    {
      id: "cycle",
      icon: ArrowLeftRight,
      tone: "violet",
      label: t("home2.kpiCycle"),
      info: t("home2.kpiCycleInfo"),
      base: o.leadToSaleDays,
      baseSub: t("home2.kpiCycleSub"),
    },
    {
      id: "conversion",
      icon: ChartPie,
      tone: "pink",
      label: t("home2.kpiConversion"),
      info: t("home2.kpiConversionInfo"),
      base: conversion,
      baseSub: t("home2.kpiConversionSub", { sold: conversion.sold, leads: conversion.leads }),
      baseFoot: conversion.allTime ? t("home2.allTime") : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
      {defs.map((d) => (
        <MetricCard key={d.id} def={d} input={input} range={range} prevRange={prevRange} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------- revenue chart */

type Group = "auto" | "day" | "week" | "month";
type DailyRow = Overview["daily"][number];

/** Days as they are, by week from the first day, or by calendar month. */
function groupDaily(
  days: DailyRow[],
  group: Group,
): { rows: DailyRow[]; by: "day" | "week" | "month" } {
  const by = group === "auto" ? (days.length <= 62 ? "day" : "week") : group;
  if (by === "day") return { rows: days, by };
  const out: DailyRow[] = [];
  const keyOf = (iso: string, i: number) => {
    const d = new Date(iso);
    return by === "week" ? String(Math.floor(i / 7)) : `${d.getFullYear()}-${d.getMonth()}`;
  };
  let key = "";
  days.forEach((d, i) => {
    const k = keyOf(d.date, i);
    if (k !== key) {
      out.push({ date: d.date, revenue: 0, deals: 0 });
      key = k;
    }
    const last = out[out.length - 1]!;
    last.revenue += d.revenue;
    last.deals += d.deals;
  });
  return { rows: out, by };
}

function RevenueChart({ o }: { o: Overview }) {
  const { t, lang } = useI18n();
  const { format, formatCompact } = useCurrency();
  const { settings, update, reset, changed } = useCardSettings("revenueChart");
  const group: Group = settings.group ?? "auto";
  const view = (["chart", "bars", "table"] as const).find((v) => v === settings.view) ?? "chart";
  const showDeals = settings.showDeals ?? true;
  const target = settings.target ?? null;
  const { rows: data, by } = useMemo(() => groupDaily(o.daily, group), [o.daily, group]);
  const label = (iso: string) => {
    const d = new Date(iso);
    if (by === "month") {
      return lang === "uz"
        ? `${MONTHS_UZ[d.getMonth()]} ${d.getFullYear()}`
        : `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    }
    const day =
      lang === "uz"
        ? `${d.getDate()}-${MONTHS_UZ[d.getMonth()]!.slice(0, 3)}`
        : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    return by === "week" ? t("cardset.weekOf", { d: day }) : day;
  };
  const tick = (iso: string) => {
    const d = new Date(iso);
    if (by === "month")
      return lang === "uz" ? MONTHS_UZ[d.getMonth()]!.slice(0, 3) : String(d.getMonth() + 1);
    if (by === "week") return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    return String(d.getDate());
  };
  const met = (v: number) => target != null && v >= target;

  const settingsPanel = (
    <CardSettingsButton title={t("home2.revenueTitle")} changed={changed} onReset={reset}>
      <SettingSection label={t("cardset.view")}>
        <ViewPicker
          value={view}
          onChange={(v) => update({ view: v === "chart" ? undefined : v })}
          options={[
            { value: "chart", label: t("cardset.view.area"), icon: ChartSpline },
            { value: "bars", label: t("cardset.view.bars"), icon: ChartColumn },
            { value: "table", label: t("cardset.view.table"), icon: Table2 },
          ]}
        />
      </SettingSection>
      <SettingSection label={t("cardset.group")} hint={t("cardset.groupHint")}>
        <OptionList
          value={group}
          onChange={(v) => update({ group: v === "auto" ? undefined : v })}
          options={(["auto", "day", "week", "month"] as const).map((g) => ({
            value: g,
            label: t(`cardset.group.${g}`),
          }))}
        />
      </SettingSection>
      {view !== "table" && (
        <SettingSection label={t("cardset.extra")}>
          <ToggleRow
            label={t("cardset.showDeals")}
            hint={t("cardset.showDealsHint")}
            checked={showDeals}
            onChange={(v) => update({ showDeals: v ? undefined : false })}
          />
        </SettingSection>
      )}
      <SettingSection label={t("cardset.rule")} hint={t("cardset.planHint")}>
        <TargetInput
          key={target ?? "none"}
          value={target}
          unit={t("cardset.unit.money")}
          onChange={(v) => update({ target: v })}
        />
      </SettingSection>
    </CardSettingsButton>
  );

  const tooltip = (
    <Tooltip
      cursor={
        view === "bars"
          ? { fill: "var(--accent)", opacity: 0.35 }
          : { stroke: "#5b8cff", strokeDasharray: "3 3", strokeOpacity: 0.6 }
      }
      content={({ active, payload }) => {
        const p = active ? (payload?.[0]?.payload as DailyRow | undefined) : undefined;
        if (!p) return null;
        return (
          <div className="rounded-xl border border-popover-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
            <p className="text-[11px] text-muted-foreground">{label(p.date)}</p>
            <p className={cn("text-sm font-bold tabular-nums", met(p.revenue) && "text-success")}>
              {format(p.revenue)}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {t("home2.dealsN", { n: p.deals })}
            </p>
          </div>
        );
      }}
    />
  );
  const yAxis = (
    <YAxis
      width={72}
      // Room for the plan line even when every bar is below it.
      domain={[0, (max: number) => Math.max(max, (target ?? 0) * 1.1)]}
      tickLine={false}
      axisLine={false}
      tick={{ fill: "var(--subtle)", fontSize: 11 }}
      tickFormatter={(v: number) => (v ? formatCompact(v, lang) : "0")}
    />
  );
  const plan =
    target != null ? (
      <ReferenceLine
        y={target}
        stroke="var(--success)"
        strokeDasharray="5 4"
        ifOverflow="extendDomain"
        label={{
          value: t("cardset.planLine"),
          position: "insideTopRight",
          fill: "var(--success)",
          fontSize: 11,
        }}
      />
    ) : null;
  const xTicks = !showDeals || view === "bars";

  return (
    <div className="surface-card flex min-w-0 flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">{t("home2.revenueTitle")}</h3>
          <p className="mt-0.5 text-[12.5px] text-subtle">{t("home2.revenueDesc")}</p>
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
          {view !== "table" && (
            <span className="inline-flex items-center gap-1.5">
              <i
                className={cn(
                  "w-2.5 rounded-full bg-[#5b8cff]",
                  view === "bars" ? "h-2.5 rounded-[3px]" : "h-[3px]",
                )}
              />
              {t("home2.legendRevenue")}
            </span>
          )}
          {view === "chart" && showDeals && (
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[3px] bg-violet-500" />
              {t("home2.legendDeals")}
            </span>
          )}
          {settingsPanel}
        </div>
      </div>

      {view === "table" ? (
        <div className="mt-3 max-h-[296px] overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-bold">{t("cardset.col.date")}</th>
                <th className="px-3 py-2 text-right font-bold">{t("home2.legendRevenue")}</th>
                <th className="px-3 py-2 text-right font-bold">{t("home2.legendDeals")}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((r) => (
                <tr key={r.date} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted-foreground">{label(r.date)}</td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right font-semibold tabular-nums",
                      target != null
                        ? met(r.revenue)
                          ? "text-success"
                          : "text-foreground"
                        : "text-foreground",
                    )}
                  >
                    {r.revenue ? format(r.revenue) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                    {r.deals || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={cn("mt-3 w-full", xTicks ? "h-[296px]" : "h-[210px]")}>
            <ResponsiveContainer width="100%" height="100%">
              {view === "bars" ? (
                <BarChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={{ fill: "var(--subtle)", fontSize: 10.5 }}
                    tickFormatter={tick}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />
                  {yAxis}
                  {tooltip}
                  {plan}
                  <Bar
                    dataKey="revenue"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  >
                    {data.map((r) => (
                      <Cell key={r.date} fill={met(r.revenue) ? "#22c55e" : "#5b8cff"} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
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
                  <XAxis
                    dataKey="date"
                    hide={!xTicks}
                    scale="point"
                    padding={{ left: 6, right: 6 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={{ fill: "var(--subtle)", fontSize: 10.5 }}
                    tickFormatter={tick}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />
                  {yAxis}
                  {tooltip}
                  {plan}
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
              )}
            </ResponsiveContainer>
          </div>
          {!xTicks && (
            <div className="h-[86px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 4, right: 6, bottom: 0, left: 0 }}
                  syncId="home-rev"
                >
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
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- today */

const TODAY_FILTERS = ["all", "overdue", "today"] as const;

function TodayColumn() {
  const { t } = useI18n();
  const { settings, update, reset, changed } = useCardSettings("todayTasks");
  const limit = [6, 10, 15].includes(settings.limit ?? 0) ? settings.limit! : 6;
  const filter = TODAY_FILTERS.find((f) => f === settings.filter) ?? "all";
  const { data, isLoading } = useTodayTasks(limit, filter);
  const now = Date.now();
  const tasks = data?.tasks ?? [];
  const overdue = tasks.filter((x) => new Date(x.due_date).getTime() < now).length;
  return (
    <div className="surface-card flex min-w-0 flex-col p-5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
          {t("home2.todayTitle")}
        </h3>
        {overdue > 0 && (
          <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">
            {t("home2.overdueN", { n: overdue })}
          </span>
        )}
        <CardSettingsButton title={t("home2.todayTitle")} changed={changed} onReset={reset}>
          <SettingSection label={t("cardset.show")}>
            <OptionList
              value={filter}
              onChange={(v) => update({ filter: v === "all" ? undefined : v })}
              options={TODAY_FILTERS.map((f) => ({
                value: f,
                label: t(`cardset.today.${f}`),
                desc: t(`cardset.today.${f}.desc`),
              }))}
            />
          </SettingSection>
          <SettingSection label={t("cardset.limit")}>
            <ViewPicker
              value={String(limit)}
              onChange={(v) => update({ limit: v === "6" ? undefined : Number(v) })}
              options={[6, 10, 15].map((n) => ({
                value: String(n),
                label: t("cardset.limitN", { n }),
                icon: ListOrdered,
              }))}
            />
          </SettingSection>
        </CardSettingsButton>
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

const DISC_KEYS = ["withTask", "onTime", "overdue"] as const;
type DiscKey = (typeof DISC_KEYS)[number];

/** A ring filled to pct, the number in the middle. */
function Ring({ pct, color, label }: { pct: number | null; color: string; label: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden>
        <circle r={r} cx="39" cy="39" fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle
          r={r}
          cx="39"
          cy="39"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(circ * v) / 100} ${circ}`}
          transform="rotate(-90 39 39)"
        />
        <text
          x="39"
          y="44"
          textAnchor="middle"
          className="fill-foreground"
          fontSize="15"
          fontWeight="700"
        >
          {pct == null ? "—" : `${pct}%`}
        </text>
      </svg>
      <span className="max-w-full truncate text-center text-xs text-subtle">{label}</span>
    </div>
  );
}

function TaskDiscipline({ o }: { o: Overview }) {
  const { t } = useI18n();
  const { settings, update, reset, changed } = useCardSettings("taskDiscipline");
  const view = (["tiles", "rings", "list"] as const).find((v) => v === settings.view) ?? "tiles";
  const hidden = new Set(settings.hide ?? []);
  const target = settings.target ?? null;
  const x = o.tasks;
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const onTimeClass =
    target != null && x.onTimePct != null
      ? x.onTimePct >= target
        ? "text-success"
        : "text-destructive"
      : "text-success";
  const items: Record<
    DiscKey,
    { label: string; value: number | null; sub: string; className: string; color: string }
  > = {
    withTask: {
      label: t("home2.discWithTask"),
      value: x.leadsWithTaskPct,
      sub: t("home2.discWithTaskSub", { a: x.leadsWithTask, b: x.openLeads }),
      className: "text-[var(--primary-ink)]",
      color: "#5b8cff",
    },
    onTime: {
      label: t("home2.discOnTime"),
      value: x.onTimePct,
      sub: t("home2.discOnTimeSub", { a: x.onTime, b: x.done }),
      className: onTimeClass,
      color: onTimeClass === "text-destructive" ? "#ef4444" : "#22c55e",
    },
    overdue: {
      label: t("home2.discOverdue"),
      value: x.overduePct,
      sub: t("home2.discOverdueSub", { n: x.overdue }),
      className: "text-destructive",
      color: "#ef4444",
    },
  };
  const shown = DISC_KEYS.filter((k) => !hidden.has(k));
  const cols =
    { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }[shown.length] ?? "grid-cols-3";
  return (
    <div className="surface-card min-w-0 p-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-foreground">{t("home2.discTitle")}</h3>
          <p className="mt-0.5 text-[12.5px] text-subtle">{t("home2.discDesc")}</p>
        </div>
        <CardSettingsButton title={t("home2.discTitle")} changed={changed} onReset={reset}>
          <SettingSection label={t("cardset.view")}>
            <ViewPicker
              value={view}
              onChange={(v) => update({ view: v === "tiles" ? undefined : v })}
              options={[
                { value: "tiles", label: t("cardset.view.tiles"), icon: LayoutGrid },
                { value: "rings", label: t("cardset.view.rings"), icon: CircleGauge },
                { value: "list", label: t("cardset.view.list"), icon: ListOrdered },
              ]}
            />
          </SettingSection>
          <SettingSection label={t("cardset.metrics")} hint={t("cardset.metricsHint")}>
            <div className="space-y-2.5">
              {DISC_KEYS.map((k) => (
                <ToggleRow
                  key={k}
                  label={items[k].label}
                  checked={!hidden.has(k)}
                  onChange={(v) => {
                    const next = new Set(hidden);
                    if (v) next.delete(k);
                    else next.add(k);
                    // Keep at least one number on the card.
                    if (next.size >= DISC_KEYS.length) return;
                    update({ hide: [...next] });
                  }}
                />
              ))}
            </div>
          </SettingSection>
          <SettingSection label={t("cardset.rule")} hint={t("cardset.onTimeHint")}>
            <TargetInput
              key={target ?? "none"}
              value={target}
              unit="%"
              onChange={(v) => update({ target: v })}
            />
          </SettingSection>
        </CardSettingsButton>
      </div>

      {view === "tiles" && (
        <div className={cn("mt-4 grid gap-3 phone:grid-cols-1", cols)}>
          {shown.map((k) => (
            <DisciplineTile
              key={k}
              label={items[k].label}
              value={pct(items[k].value)}
              sub={items[k].sub}
              className={items[k].className}
            />
          ))}
        </div>
      )}
      {view === "rings" && (
        <div className={cn("mt-4 grid gap-3", cols)}>
          {shown.map((k) => (
            <Ring key={k} pct={items[k].value} color={items[k].color} label={items[k].label} />
          ))}
        </div>
      )}
      {view === "list" && (
        <div className="mt-4 space-y-3">
          {shown.map((k) => (
            <div key={k}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-foreground">{items[k].label}</span>
                <b className={cn("tabular-nums", items[k].className)}>{pct(items[k].value)}</b>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${items[k].value ?? 0}%`, background: items[k].color }}
                />
              </div>
              <p className="mt-0.5 text-[11.5px] text-subtle">{items[k].sub}</p>
            </div>
          ))}
        </div>
      )}
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
  const { settings, update, reset, changed } = useCardSettings("callTypes");
  const view = (["donut", "bars", "list"] as const).find((v) => v === settings.view) ?? "donut";
  const c = o.callTypes;
  const parts = [
    { key: "repeat", label: t("home2.ctRepeat"), n: c.repeat, color: "#5b8cff" },
    { key: "first", label: t("home2.ctFirst"), n: c.first, color: "#8b7cf6" },
    { key: "other", label: t("home2.ctOther"), n: c.other, color: "#e8a93a" },
  ];
  const share = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  let off = 0;
  const legend = (
    <div className="min-w-0 flex-1">
      {parts.map((p) => (
        <div key={p.key} className="flex items-center gap-2.5 py-1.5">
          <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{p.label}</span>
          <span className="w-10 text-right text-[12.5px] tabular-nums text-subtle">
            {share(p.n)}%
          </span>
          <b className="w-12 text-right tabular-nums text-foreground">{p.n}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div className="surface-card min-w-0 p-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-foreground">{t("home2.ctTitle")}</h3>
          <p className="mt-0.5 text-[12.5px] text-subtle">{t("home2.ctDesc")}</p>
        </div>
        <CardSettingsButton title={t("home2.ctTitle")} changed={changed} onReset={reset}>
          <SettingSection label={t("cardset.view")}>
            <ViewPicker
              value={view}
              onChange={(v) => update({ view: v === "donut" ? undefined : v })}
              options={[
                { value: "donut", label: t("cardset.view.donut"), icon: ChartPie },
                { value: "bars", label: t("cardset.view.hbars"), icon: ChartBarBig },
                { value: "list", label: t("cardset.view.list"), icon: ListOrdered },
              ]}
            />
          </SettingSection>
          <SettingSection label={t("cardset.formula")}>
            <p className="text-[12px] leading-snug text-subtle">{t("cardset.callTypesHow")}</p>
          </SettingSection>
        </CardSettingsButton>
      </div>

      {view === "donut" && (
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
          {legend}
        </div>
      )}
      {view === "bars" && (
        <div className="mt-4 space-y-3.5">
          {parts.map((p) => (
            <div key={p.key}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-foreground">{p.label}</span>
                <span className="tabular-nums text-subtle">
                  <b className="text-foreground">{p.n}</b> · {share(p.n)}%
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share(p.n)}%`, background: p.color }}
                />
              </div>
            </div>
          ))}
          <p className="text-[12.5px] text-subtle">
            {t("cardset.totalCalls")} <b className="text-foreground">{c.total}</b>
          </p>
        </div>
      )}
      {view === "list" && (
        <div className="mt-3">
          {legend}
          <p className="mt-1 border-t border-border pt-2 text-[12.5px] text-subtle">
            {t("cardset.totalCalls")} <b className="text-foreground">{c.total}</b>
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- the page */

export function HomeOverviewSection({
  range,
  prevRange,
  funnel,
  ownerIds,
  statsScope,
}: {
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
  funnel: string | null;
  ownerIds: string[] | null;
  /** The dashboard's own date/owner scope, for the classic Konversiya. */
  statsScope: StatsScope;
}) {
  const { overview, metricInput, isLoading } = useHomeOverview(range, prevRange, {
    funnel,
    ownerIds,
  });
  const conversion = useClassicConversion(funnel, statsScope, overview?.conversion.series ?? []);
  if (isLoading || !overview || !conversion || !metricInput) {
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
      <KpiGrid
        o={overview}
        conversion={conversion}
        input={metricInput}
        range={range}
        prevRange={prevRange}
      />
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

export type OverviewPart = "kpis" | "revenue" | "today" | "tasks" | "calls";

/**
 * One block of the overview on its own, for the customisable Bosh sahifa
 * board: the same data as HomeOverviewSection (one query, shared), only
 * this block drawn.
 */
export function HomeOverviewPart({
  part,
  range,
  prevRange,
  funnel,
  ownerIds,
  statsScope,
}: {
  part: OverviewPart;
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
  funnel: string | null;
  ownerIds: string[] | null;
  statsScope: StatsScope;
}) {
  const { overview, metricInput, isLoading } = useHomeOverview(range, prevRange, {
    funnel,
    ownerIds,
  });
  const conversion = useClassicConversion(funnel, statsScope, overview?.conversion.series ?? []);
  if (part === "today") return <TodayColumn />;
  if (isLoading || !overview || !conversion || !metricInput) {
    return part === "kpis" ? (
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[178px] rounded-[var(--radius)]" />
        ))}
      </div>
    ) : (
      <Skeleton className="h-[320px] w-full rounded-[var(--radius)]" />
    );
  }
  if (part === "kpis")
    return (
      <KpiGrid
        o={overview}
        conversion={conversion}
        input={metricInput}
        range={range}
        prevRange={prevRange}
      />
    );
  if (part === "revenue") return <RevenueChart o={overview} />;
  if (part === "tasks") return <TaskDiscipline o={overview} />;
  return <CallTypes o={overview} />;
}
