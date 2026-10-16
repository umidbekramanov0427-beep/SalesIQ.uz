import { Link } from "@tanstack/react-router";
import { Clock, Wallet } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useCollectedPayments } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { summarizeCollected } from "@/lib/lead-payments/collected";
import { formatSom } from "@/lib/lead-payments/paid-stage";
import { formatDate } from "@/lib/utils";

// Money clients really paid through the company's Payme / Click payment
// links in the dashboard's period -- unlike "Tushum", which adds up the
// budgets of won deals. Hidden until the company has sent a payment link.
export function CollectedPaymentsCard({
  funnel,
  dateRange,
  className,
}: {
  className?: string | undefined;
  funnel: string | null;
  dateRange: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const { data: rows = [] } = useCollectedPayments(funnel);
  if (rows.length === 0) return null;
  const s = summarizeCollected(rows, dateRange);
  const share = s.paidTotal > 0 ? Math.round((s.payme / s.paidTotal) * 100) : 0;

  return (
    <SectionCard
      {...(className ? { className } : {})}
      icon={Wallet}
      tone="emerald"
      title={t("collected.title")}
      description={t("collected.desc")}
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[34px] font-bold leading-none tracking-tight tabular-nums text-foreground">
              {formatSom(s.paidTotal)}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">so'm</span>
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {t("collected.count", { n: String(s.paidCount) })}
          </p>
          {s.paidTotal > 0 && (
            <div className="mt-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <span className="bg-[#00b9b9]" style={{ width: `${share}%` }} />
                <span className="bg-[#0a74ff]" style={{ width: `${100 - share}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-[#00b9b9]" /> Payme ·{" "}
                  <b className="font-semibold tabular-nums text-foreground">{formatSom(s.payme)}</b>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-[#0a74ff]" /> Click ·{" "}
                  <b className="font-semibold tabular-nums text-foreground">{formatSom(s.click)}</b>
                </span>
              </div>
            </div>
          )}
          {s.pendingCount > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1 text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
              <Clock className="h-3.5 w-3.5" />
              {t("collected.pending", {
                n: String(s.pendingCount),
                amount: formatSom(s.pendingTotal),
              })}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">
            {t("collected.recent")}
          </p>
          {s.recent.length === 0 ? (
            <p className="rounded-xl bg-surface px-3 py-4 text-center text-sm text-muted-foreground">
              {t("collected.none")}
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {s.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/crm/leads/$leadId"
                    params={{ leadId: r.lead_id }}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {r.lead_name || "—"}
                      </span>
                      <span className="block text-[12px] text-muted-foreground">
                        {r.provider === "click" ? "Click" : "Payme"} · {formatDate(r.paid_at!)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                      {formatSom(r.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
