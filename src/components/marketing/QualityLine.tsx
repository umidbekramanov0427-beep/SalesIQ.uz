import { useI18n } from "@/lib/i18n";
import type { QualityRow } from "@/lib/marketing";

// One source or campaign on a quality card: name, hot/warm/cold split,
// average AI score, lead count and conversion to sales.
export function QualityLine({ r, none }: { r: QualityRow; none: string }) {
  const { t } = useI18n();
  const total = Math.max(1, r.hot + r.warm + r.cold);
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-foreground">{r.key ?? none}</p>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="bg-rose-500" style={{ width: `${(r.hot / total) * 100}%` }} />
          <span className="bg-amber-400" style={{ width: `${(r.warm / total) * 100}%` }} />
          <span className="bg-sky-400" style={{ width: `${(r.cold / total) * 100}%` }} />
        </div>
      </div>
      <div className="w-[64px] shrink-0 text-right">
        <p className="font-mono text-[14px] font-bold tabular-nums text-foreground">
          {r.avgScore == null ? "—" : r.avgScore}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("mkt.scoreShort")}</p>
      </div>
      <div className="w-[64px] shrink-0 text-right">
        <p className="font-mono text-[14px] font-bold tabular-nums text-foreground">{r.leads}</p>
        <p className="text-[11px] text-muted-foreground">{t("fin.leads")}</p>
      </div>
      <div className="w-[64px] shrink-0 text-right">
        <p className="font-mono text-[14px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {r.conversion}%
        </p>
        <p className="text-[11px] text-muted-foreground">{t("mkt.conv")}</p>
      </div>
    </div>
  );
}
