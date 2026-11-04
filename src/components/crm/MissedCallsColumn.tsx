import { Link } from "@tanstack/react-router";
import { PhoneCall, PhoneMissed } from "lucide-react";
import { useOpenMissedCalls } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";

// The board's first column (5CRM "Пропущенный"): incoming calls nobody
// answered and nobody has called back yet -- this funnel's leads and numbers
// no lead has. A call back with the same number takes the card off
// (the pbx_calls trigger closes it). Hidden while there are none.
export function MissedCallsColumn({ funnelLeadIds }: { funnelLeadIds: Set<string> }) {
  const { t } = useI18n();
  const { data = [] } = useOpenMissedCalls();
  const items = data.filter((c) => !c.leadId || funnelLeadIds.has(c.leadId));
  if (items.length === 0) return null;
  return (
    <section className="flex w-[86vw] max-w-[290px] shrink-0 flex-col sm:w-[290px]">
      <header className="px-1 pb-2 pt-1 text-center">
        <h2 className="truncate text-[13px] font-bold uppercase tracking-[0.04em] text-foreground">
          {t("missedCol.title")}
        </h2>
        <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
          {t("missedCol.count", { n: items.length })}
        </p>
        <span className="mt-2 block h-[2px] rounded-full bg-rose-500" />
      </header>
      <div className="flex-1 space-y-1.5 pb-2">
        {items.map((c) => (
          <article
            key={c.id}
            className="rounded-xl border border-rose-500/30 bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/12 text-rose-600 dark:text-rose-300">
                <PhoneMissed className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                {c.leadId ? (
                  <Link
                    to="/crm/leads/$leadId"
                    params={{ leadId: c.leadId }}
                    className="block truncate text-[14px] font-semibold text-primary hover:underline"
                  >
                    {c.leadName ?? c.number}
                  </Link>
                ) : (
                  <p className="truncate text-[14px] font-semibold text-foreground">
                    {t("missedCol.unknown")}
                  </p>
                )}
                <p className="truncate font-mono text-[12.5px] tabular-nums text-muted-foreground">
                  {c.number}
                </p>
              </div>
              <span className="shrink-0 text-[11.5px] text-rose-600 dark:text-rose-300">
                {timeAgo(c.at)}
              </span>
            </div>
            <a
              href={`tel:${c.number}`}
              className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-[12.5px] font-semibold text-white transition-[filter] hover:brightness-110"
            >
              <PhoneCall className="h-3.5 w-3.5" /> {t("missedCol.callBack")}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
