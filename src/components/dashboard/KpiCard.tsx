import type { Kpi } from "@/lib/dashboard-data";
import { AnimatedValue } from "@/hooks/use-count-up";
import { FitText } from "@/components/ui/fit-text";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / span) * 24}`)
    .join(" L ");

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <path
        d={`M ${d}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={positive ? "text-success" : "text-destructive"}
      />
    </svg>
  );
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const positive = kpi.delta >= 0;
  const Icon = kpi.icon;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <article
            tabIndex={0}
            aria-label={`${kpi.label}: ${kpi.value}`}
            className="mint-card kpi-sheen group min-w-0 cursor-default p-6 outline-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">
                {kpi.label}
              </p>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background/70 text-mint-foreground">
                <Icon className="h-4 w-4" />
              </span>
            </div>

            <FitText className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-foreground">
              <AnimatedValue value={kpi.value} />
            </FitText>

            <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold",
                  positive ? "text-success" : "text-destructive",
                )}
              >
                {positive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {positive ? "+" : ""}
                {kpi.delta}%
              </span>
              <span className="min-w-0 truncate text-subtle">{kpi.comparison}</span>
            </div>

            <div className="mt-3">
              <Sparkline points={kpi.spark} positive={positive} />
            </div>
          </article>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">{kpi.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
