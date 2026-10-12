import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, Minus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FUNNEL_STEPS } from "@/lib/trial-score";
import { usePlatformFunnel, type PlatformFunnelCompany } from "@/hooks/use-crm-data";

// The visits report's "Customer path" tab: how far companies got, from
// sign-up to the first payment, and the step most of them stop at.

export function FunnelPanel({ onExport }: { onExport?: (rows: PlatformFunnelCompany[]) => void }) {
  const { t } = useI18n();
  const [days, setDays] = useState<30 | 90 | null>(null);
  const { data, isLoading, error } = usePlatformFunnel(days);
  const periods: { id: 30 | 90 | null; label: string }[] = [
    { id: 30, label: t("visits.days30") },
    { id: 90, label: t("visits.days90") },
    { id: null, label: t("visits.allTime") },
  ];
  const worst =
    data && data.total
      ? data.steps.reduce((a, b) => (b.stoppedHere > a.stoppedHere ? b : a), data.steps[0]!)
      : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
        <span className="px-2 text-xs font-semibold text-muted-foreground">
          {t("visits.signedUpIn")}
        </span>
        <div className="flex gap-1">
          {periods.map((p) => (
            <button
              key={String(p.id)}
              type="button"
              onClick={() => setDays(p.id)}
              className={cn(
                "h-9 rounded-xl px-3 text-xs font-semibold transition-colors",
                days === p.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {onExport && (
          <button
            type="button"
            disabled={!data?.companies.length}
            onClick={() => data && onExport(data.companies)}
            className="ml-auto inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            {t("visits.excel")}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : error || !data ? (
        <p className="mt-4 text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      ) : data.total === 0 ? (
        <p className="mt-4 text-sm text-subtle">{t("visits.funnelEmpty")}</p>
      ) : (
        <>
          <section className="mt-4 rounded-2xl border border-border bg-card p-4">
            <ol className="space-y-3">
              {data.steps.map((s, i) => {
                const pct = Math.round((s.reached / data.total) * 100);
                const isWorst = worst?.step === s.step && s.stoppedHere > 0;
                return (
                  <li key={s.step} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-foreground">
                          {t(`visits.step.${s.step}`)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          <b className="text-foreground">{s.reached}</b> / {data.total} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(pct, s.reached ? 2 : 0)}%` }}
                        />
                      </div>
                      {s.stoppedHere > 0 && (
                        <p
                          className={cn(
                            "mt-1 text-[11px]",
                            isWorst ? "font-semibold text-destructive" : "text-subtle",
                          )}
                        >
                          {t("visits.stoppedHere", { n: String(s.stoppedHere) })}
                          {isWorst ? ` · ${t("visits.mostStop")}` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-3 py-2.5 font-semibold">{t("visits.company")}</th>
                  {FUNNEL_STEPS.map((s) => (
                    <th key={s} className="px-2 py-2.5 text-center font-semibold">
                      {t(`visits.stepShort.${s}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        to="/platform/usage/$orgId"
                        params={{ orgId: c.id }}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <p className="text-[11px] text-subtle">
                        {new Date(c.createdAt).toLocaleDateString()} ·{" "}
                        {c.frozen ? t("orgcard.frozen") : t(`visits.phase.${c.phase}`)}
                      </p>
                    </td>
                    {FUNNEL_STEPS.map((s) => (
                      <td key={s} className="px-2 py-2 text-center">
                        {c.done[s] ? (
                          <Check className="mx-auto h-4 w-4 text-success" />
                        ) : c.stoppedAt === s ? (
                          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                            {t("visits.stuck")}
                          </span>
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-subtle/60" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
