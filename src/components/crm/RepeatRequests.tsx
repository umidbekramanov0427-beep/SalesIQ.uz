import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Repeat2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRecentRepeatRequests } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";

// The board's "repeat requests" button (5CRM): clients who wrote again in
// the last 7 days and were merged into their existing lead. The badge counts
// the ones this person hasn't looked at yet (remembered in this browser).
export function RepeatRequestsButton() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: rows = [] } = useRecentRepeatRequests();
  const key = `salesiq.repeatsSeen.${user?.id ?? "x"}`;
  const read = () => {
    try {
      return Number(localStorage.getItem(key) ?? 0);
    } catch {
      return 0;
    }
  };
  const [seen, setSeen] = useState(read);
  const fresh = rows.filter((r) => new Date(r.last_repeat_at).getTime() > seen).length;
  if (rows.length === 0) return null;

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        const now = Date.now();
        setSeen(now);
        try {
          localStorage.setItem(key, String(now));
        } catch {
          // storage unavailable -- the badge just resets on reload
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("repeats.title")}
          aria-label={t("repeats.title")}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-bold transition-colors",
            fresh > 0
              ? "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <Repeat2 className="h-[18px] w-[18px]" strokeWidth={2.4} />
          <span
            className={cn(
              "min-w-[22px] rounded-full px-1.5 py-px text-center text-[11.5px] font-extrabold tabular-nums",
              fresh > 0 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {fresh > 0 ? fresh : rows.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border px-3 py-2.5 text-[13px] font-bold text-foreground">
          {t("repeats.title")}
          <span className="ml-1.5 font-medium text-subtle">{t("repeats.period")}</span>
        </p>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to="/crm/leads/$leadId"
                params={{ leadId: r.id }}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent"
              >
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-amber-500/15 px-1 text-[11.5px] font-extrabold text-amber-700 dark:text-amber-300">
                  ×{r.repeat_count + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {r.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-subtle">
                    {r.funnel ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-subtle">
                  {timeAgo(r.last_repeat_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
