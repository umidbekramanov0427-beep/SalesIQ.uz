import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n";

// The pickup-rate line of "Mijozlar qaysi soatda telefon ko'taradi" (loaded
// on its own so recharts stays out of the page's first chunk). One series:
// the share of calls answered each hour. An hour with no calls has no rate,
// so the solid line breaks there and a faint dashed line only links the
// hours around it; the best hours' points are green.

export type PickupPoint = {
  hour: number;
  rate: number | null;
  total: number;
  connected: number;
  best: boolean;
};

export default function PickupHoursChart({ data }: { data: PickupPoint[] }) {
  const { t } = useI18n();
  return (
    <div className="h-[230px] w-full phone:h-[190px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="rp-pickup-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--rp-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--rp-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--rp-rule)" strokeDasharray="3 4" />
          <XAxis
            dataKey="hour"
            tickFormatter={(h: number) => `${h}:00`}
            tick={{ fill: "var(--rp-mute)", fontSize: 11.5 }}
            tickLine={false}
            axisLine={{ stroke: "var(--rp-rule)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--rp-mute)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "var(--rp-mute)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as PickupPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-[12.5px] text-popover-foreground shadow-md">
                  <p className="font-semibold">
                    {p.hour}:00–{p.hour + 1}:00
                  </p>
                  {p.total > 0 ? (
                    <>
                      <p className="mt-0.5 text-[15px] font-bold tabular-nums">
                        {Math.round(p.rate ?? 0)}% {t("rp.pickedUp")}
                      </p>
                      <p className="text-muted-foreground">
                        {t("rp.hourCounts", { total: p.total, connected: p.connected })}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t("rp.hourNoCalls")}</p>
                  )}
                </div>
              );
            }}
          />
          {/* Faint link across hours without calls. */}
          <Line
            dataKey="rate"
            connectNulls
            stroke="var(--rp-mute)"
            strokeOpacity={0.45}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="rate"
            type="linear"
            stroke="var(--rp-accent)"
            strokeWidth={2.25}
            fill="url(#rp-pickup-fill)"
            connectNulls={false}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: PickupPoint; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (cx == null || cy == null || !payload || payload.rate == null) {
                return <g key={`d${index}`} />;
              }
              return (
                <circle
                  key={`d${index}`}
                  cx={cx}
                  cy={cy}
                  r={payload.best ? 6 : 4.5}
                  fill={payload.best ? "var(--rp-a)" : "var(--rp-paper)"}
                  stroke={payload.best ? "var(--rp-paper)" : "var(--rp-accent)"}
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{
              r: 6.5,
              fill: "var(--rp-accent)",
              stroke: "var(--rp-paper)",
              strokeWidth: 2,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
