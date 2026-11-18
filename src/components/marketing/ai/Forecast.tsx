import { LineChart, Loader2, ShieldAlert } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useMarketingAiQuery, type AiScope } from "@/hooks/use-crm-data";
import type { AiForecasts } from "@/lib/marketing-ai/types";
import type { Forecast } from "@/lib/marketing-ai/forecast";
import { num, tashkentDay, useMoney } from "@/components/marketing/ai/shared";

// AI tahlilchi -> Prognoz: the next four weeks from the last twelve, a
// straight-line trend with a range -- only with 4+ full weeks of history,
// always with the confidence and the weeks used, never as a promise.

export function AiForecastTab({ scope }: { scope: AiScope }) {
  const { t } = useI18n();
  const money = useMoney();
  const q = useMarketingAiQuery<AiForecasts>("forecast", {
    action: "forecast",
    scope: { project: scope.project, campaign: scope.campaign },
  });
  if (q.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (q.error || !q.data)
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        {String(q.error?.message ?? "")}
      </p>
    );
  const d = q.data;
  const cards: { k: string; f: Forecast; money?: boolean }[] = [
    { k: "ai.fc.leads", f: d.leads },
    { k: "ai.fc.qualified", f: d.qualified },
    { k: "ai.fc.prepaid", f: d.prepaid },
    { k: "ai.fc.paid", f: d.paid },
    { k: "ai.fc.revenue", f: d.revenue, money: true },
    { k: "ai.fc.spend", f: d.spend, money: true },
  ];
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-[13px] text-amber-900 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {t("ai.fc.disclaimer", { from: tashkentDay(d.period.from), to: tashkentDay(d.period.to) })}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <SectionCard key={c.k} icon={LineChart} tone="sky" title={t(c.k)}>
            {!c.f.enough ? (
              <p className="py-4 text-[13px] text-muted-foreground">
                {t("ai.fc.notEnough", { n: c.f.weeks })}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span>
                    {t("ai.fc.trend", {
                      v: c.money ? money(c.f.slope) : `${c.f.slope > 0 ? "+" : ""}${c.f.slope}`,
                    })}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 font-semibold",
                      c.f.confidence === "high"
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                        : c.f.confidence === "medium"
                          ? "bg-amber-500/14 text-amber-800 dark:text-amber-200"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`ai.fc.conf.${c.f.confidence}`)}
                  </span>
                </div>
                <ul className="divide-y divide-border text-[13px]">
                  {c.f.next.map((n) => (
                    <li key={n.week} className="flex items-baseline gap-2 py-1.5">
                      <span className="w-[86px] text-muted-foreground">
                        {n.week.split("-").reverse().join(".")}
                      </span>
                      <b className="flex-1 tabular-nums text-foreground">
                        {c.money ? money(n.value) : num(n.value)}
                      </b>
                      <span className="text-[11.5px] tabular-nums text-muted-foreground">
                        {c.money
                          ? `${money(n.low)} – ${money(n.high)}`
                          : `${num(n.low)} – ${num(n.high)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11.5px] text-muted-foreground">
                  {t("ai.fc.used", { n: c.f.weeks, r2: c.f.r2 })}
                </p>
              </div>
            )}
          </SectionCard>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Fact
          title={t("ai.fc.conv")}
          value={d.conversion.qualRateNext != null ? `${d.conversion.qualRateNext}%` : "—"}
          sub={
            d.conversion.qualRateNow != null
              ? t("ai.fc.convNow", { v: d.conversion.qualRateNow })
              : t("ai.fc.na")
          }
        />
        <Fact
          title={t("ai.fc.loss")}
          value={d.audienceLoss ? num(d.audienceLoss.viewersLostPerWebinar) : "—"}
          sub={
            d.audienceLoss?.qualifiedLostPerWebinar != null
              ? t("ai.fc.lossQual", { n: d.audienceLoss.qualifiedLostPerWebinar })
              : t("ai.fc.na")
          }
        />
        <Fact
          title={t("ai.fc.budget")}
          value={money(d.budget.cplNext)}
          sub={
            d.budget.cplNow != null
              ? t("ai.fc.cplNow", { v: money(d.budget.cplNow) })
              : t("ai.fc.na")
          }
        />
      </div>
    </div>
  );
}

function Fact({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[12px] text-muted-foreground">{title}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}
