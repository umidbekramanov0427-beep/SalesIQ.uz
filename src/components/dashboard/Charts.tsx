import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Filter, TrendingUp, Gauge, PhoneCall } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  useCallPickupByHour,
  useConversionQualityWeekly,
  useFunnelFlow,
  useMonthlyWonRevenue,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

function ChooseFunnelPrompt() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <Filter className="h-5 w-5 text-subtle" />
      <p className="text-sm font-medium text-muted-foreground">{t("charts.chooseFunnel")}</p>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

// Currency Y-axis labels used to always divide by 1000 ("15000k" for a
// revenue in the tens of millions), which ran wider than the chart's
// margin allowed for and got clipped down to "0000k" on the left edge for
// any account with enough revenue. Step up to "M" once a value crosses a
// million so the label stays short regardless of scale.
function abbreviateAxisValue(v: number): string {
  if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return `${v}`;
}

export function SalesFunnel({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const flow = useFunnelFlow(funnel);
  // Bar width is each stage's count relative to the largest stage — not
  // flow[0], which broke whenever the first stage in pipeline order (e.g.
  // an unused "Неразобранное") happened to have 0 leads: dividing by that
  // 0 made every other bar's width Infinity/NaN, rendering full-width
  // regardless of the stage's real share.
  const max = Math.max(1, ...flow.map((s) => s.count));
  if (!funnel) {
    return (
      <SectionCard
        icon={Filter}
        tone="violet"
        title={t("charts.funnel.title")}
        description={t("charts.funnel.desc")}
        info={t("charts.funnel.info")}
      >
        <ChooseFunnelPrompt />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      icon={Filter}
      tone="violet"
      title={t("charts.funnel.title")}
      description={t("charts.funnel.desc")}
      info={t("charts.funnel.info")}
    >
      <ol className="space-y-3">
        {flow.map((s) => (
          <li key={s.stage}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="text-xs text-subtle">
                {s.count.toLocaleString()} · {s.conversion}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  s.stage === "Lost"
                    ? "bg-destructive"
                    : s.stage === "Won"
                      ? "bg-success"
                      : "bg-primary",
                )}
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

export function MonthlyRevenueTrendChart({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const { format: currency } = useCurrency();
  const monthlyTrend = useMonthlyWonRevenue(funnel);

  return (
    <SectionCard
      icon={TrendingUp}
      tone="emerald"
      title={t("dash.card.monthlyTrend")}
      description={t("dash.card.monthlyTrendDesc")}
      info={t("dash.card.monthlyTrendInfo")}
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthlyTrend} margin={{ left: -14, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <YAxis
              tickFormatter={abbreviateAxisValue}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--color-subtle)"
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => currency(v)} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={false}
              animationDuration={700}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

export function ConversionQualityChart({ funnel }: { funnel: string | null }) {
  const { t } = useI18n();
  const [scoreMin, setScoreMin] = useState(70);
  const [scoreMax, setScoreMax] = useState(100);
  const { rows, correlation } = useConversionQualityWeekly(funnel, scoreMin, scoreMax);

  return (
    <SectionCard
      icon={Gauge}
      tone="amber"
      title={t("dash.card.conversionQuality")}
      description={t("dash.card.conversionQualityDesc")}
      info={t("dash.card.conversionQualityInfo")}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-subtle">{t("dash.card.scoreRange")}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreMin}
            onChange={(e) => setScoreMin(Math.min(Number(e.target.value), scoreMax))}
            className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
          <span className="text-xs text-subtle">–</span>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreMax}
            onChange={(e) => setScoreMax(Math.max(Number(e.target.value), scoreMin))}
            className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
          {correlation != null && (
            <span className="ml-2 rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-foreground">
              {t("dash.card.correlation")}:{" "}
              <span className={correlation >= 0 ? "text-success" : "text-destructive"}>
                {correlation >= 0 ? "+" : ""}
                {correlation}
              </span>
            </span>
          )}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      ) : (
        <>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ left: -14, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--color-subtle)"
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--color-subtle)"
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="conversionPct"
                  name={t("dash.card.conversionPct")}
                  stroke="var(--color-success)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls
                  animationDuration={700}
                />
                <Line
                  type="monotone"
                  dataKey="inRangePct"
                  name={t("dash.card.inRangePct", {
                    min: String(scoreMin),
                    max: String(scoreMax),
                  })}
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls
                  animationDuration={700}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-subtle">{t("dash.card.conversionQualityHint")}</p>
        </>
      )}
    </SectionCard>
  );
}

function hourLabel(h: number): string {
  return `${String(h % 24).padStart(2, "0")}:00`;
}

// Shared by Boshqaruv paneli and Lid tahlili -- shows what hour of the day
// customers actually pick up the phone, so reps know the most effective
// window to be calling in instead of guessing.
export function CallPickupByHourChart({
  dateRange,
}: {
  dateRange?: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const { rows, bestHour, isLoading } = useCallPickupByHour(dateRange ?? null);
  const totalLabel = t("callPickup.total");
  const connectedLabel = t("callPickup.connected");
  const data = rows.map((r) => ({
    hour: hourLabel(r.hour),
    [totalLabel]: r.total,
    [connectedLabel]: r.connected,
  }));
  const hasData = rows.some((r) => r.total > 0);

  return (
    <SectionCard
      icon={PhoneCall}
      tone="sky"
      title={t("callPickup.title")}
      description={t("callPickup.desc")}
      info={t("callPickup.info")}
    >
      {!isLoading && bestHour && bestHour.total > 0 && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">
          {t("callPickup.bestWindow")}: {hourLabel(bestHour.hour)}–{hourLabel(bestHour.hour + 1)}
          <span className="text-xs font-normal text-success/80">({bestHour.rate}%)</span>
        </div>
      )}
      {!isLoading && !hasData ? (
        <p className="py-10 text-center text-sm text-subtle">{t("audio.chart.noData")}</p>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                stroke="var(--color-subtle)"
                interval={1}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                stroke="var(--color-subtle)"
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey={totalLabel}
                fill="var(--color-mint-border)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey={connectedLabel}
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
