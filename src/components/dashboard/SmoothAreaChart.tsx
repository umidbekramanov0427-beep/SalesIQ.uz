import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEChartsTokens } from "@/hooks/use-echarts-theme";

// Smooth line with a fading area fill, drawn with Recharts like every other
// dashboard chart. These two charts used to be the only ECharts ones, which
// put a second ~170 KB (gzipped) chart library on the dashboard for one
// line chart.

export type SmoothSeries = {
  key: string;
  name: string;
  color: keyof Pick<ReturnType<typeof useEChartsTokens>, "primary" | "success">;
  width?: number;
  fillOpacity?: number;
};

export function SmoothAreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  className,
  legend = false,
  formatValue,
  formatAxis,
}: {
  data: T[];
  xKey: keyof T & string;
  series: SmoothSeries[];
  className: string;
  legend?: boolean;
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
}) {
  const tokens = useEChartsTokens();
  const gradientId = useId().replace(/:/g, "");

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: legend ? 8 : 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tokens[s.color]} stopOpacity={s.fillOpacity ?? 0.22} />
                <stop offset="100%" stopColor={tokens[s.color]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={tokens.border} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: tokens.border }}
            tick={{ fill: tokens.subtle, fontSize: 11 }}
            minTickGap={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: tokens.subtle, fontSize: 11 }}
            tickFormatter={formatAxis}
            width={44}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${tokens.border}`,
              background: tokens.popover,
              color: tokens.foreground,
              fontSize: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            }}
            formatter={(v) => formatValue(Number(v))}
          />
          {legend && (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              height={28}
              wrapperStyle={{ fontSize: 12, color: tokens.mutedForeground }}
            />
          )}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={tokens[s.color]}
              strokeWidth={s.width ?? 2}
              fill={`url(#${gradientId}-${s.key})`}
              dot={false}
              activeDot={{ r: 3 }}
              animationDuration={700}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
