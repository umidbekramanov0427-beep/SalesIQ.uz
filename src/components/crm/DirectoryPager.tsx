import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// "1–60 / 50 000" with previous / next, under a paged directory list.
export function DirectoryPager({
  page,
  pageSize,
  total,
  busy,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy?: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  if (total <= pageSize) return null;
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("pager.range", {
          from: from.toLocaleString(),
          to: to.toLocaleString(),
          total: total.toLocaleString(),
        })}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> {t("pager.prev")}
        </button>
        <button
          type="button"
          className={btn}
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
        >
          {t("pager.next")} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
