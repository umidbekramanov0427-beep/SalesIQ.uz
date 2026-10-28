import { Crown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type PodiumRow = {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  wonLeads: number;
  revenue: number;
  conversion: number;
};

// Gold, silver, bronze: the ring around the avatar, the medal and the
// pedestal. The 1st place stands in the middle and highest.
const PLACES = [
  {
    ring: "ring-amber-400",
    medal: "bg-amber-400 text-amber-950",
    pedestal: "from-amber-400/30 to-amber-400/5 border-amber-400/40",
    numeral: "text-amber-500",
    height: "h-24 sm:h-28",
    avatar: "h-16 w-16 text-lg sm:h-20 sm:w-20 sm:text-xl",
  },
  {
    ring: "ring-slate-300 dark:ring-slate-400",
    medal: "bg-slate-300 text-slate-900",
    pedestal: "from-slate-400/25 to-slate-400/5 border-slate-400/40",
    numeral: "text-slate-400",
    height: "h-16 sm:h-20",
    avatar: "h-12 w-12 text-sm sm:h-16 sm:w-16 sm:text-base",
  },
  {
    ring: "ring-orange-400",
    medal: "bg-orange-400 text-orange-950",
    pedestal: "from-orange-400/25 to-orange-400/5 border-orange-400/40",
    numeral: "text-orange-500",
    height: "h-12 sm:h-14",
    avatar: "h-12 w-12 text-sm sm:h-16 sm:w-16 sm:text-base",
  },
] as const;

// Display order on the podium: 2nd, 1st, 3rd.
const ORDER = [1, 0, 2] as const;

/**
 * The top three of the ranking, on a podium. `rows` is the ranking as
 * shown (already sorted); it refreshes with the page's "Jonli" mode, and a
 * new name on a step slides in.
 */
export function Podium({
  rows,
  loading,
  live,
}: {
  rows: PodiumRow[];
  loading: boolean;
  live: boolean;
}) {
  const { t, lang } = useI18n();
  const { format, formatCompact } = useCurrency();
  const top = rows.slice(0, 3);
  const anyResult = top.some((r) => r.revenue > 0 || r.wonLeads > 0);
  if (!loading && !anyResult) return null;

  return (
    <section className="surface-card mt-6 overflow-hidden px-4 pb-0 pt-4 sm:px-6 sm:pt-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Crown className="h-4 w-4 text-amber-500" />
          {t("lb.podiumTitle")}
        </p>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {t("lb.live")}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-4">
        {ORDER.map((place) => {
          const style = PLACES[place];
          const row = top[place];
          return (
            <div key={place} className="flex min-w-0 flex-col items-center">
              {loading && !row ? (
                <>
                  <Skeleton className={cn("rounded-full", style.avatar)} />
                  <Skeleton className="mt-3 h-4 w-24" />
                  <Skeleton className="mt-2 h-5 w-20" />
                </>
              ) : row ? (
                <div key={row.id} className="tab-enter flex w-full min-w-0 flex-col items-center">
                  <div className="relative">
                    {row.avatarUrl ? (
                      <img
                        src={row.avatarUrl}
                        alt=""
                        className={cn(
                          "rounded-full object-cover ring-4 ring-offset-2 ring-offset-card",
                          style.ring,
                          style.avatar,
                        )}
                      />
                    ) : (
                      <span
                        className={cn(
                          "flex items-center justify-center rounded-full bg-mint font-bold text-mint-foreground ring-4 ring-offset-2 ring-offset-card",
                          style.ring,
                          style.avatar,
                        )}
                      >
                        {row.initials}
                      </span>
                    )}
                    {place === 0 && (
                      <Crown className="absolute -top-5 left-1/2 h-5 w-5 -translate-x-1/2 fill-amber-400 text-amber-500" />
                    )}
                    <span
                      className={cn(
                        "absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold shadow-soft",
                        style.medal,
                      )}
                    >
                      {place + 1}
                    </span>
                  </div>
                  <p className="mt-3 max-w-full truncate text-center text-xs font-bold text-foreground sm:text-sm">
                    {row.name}
                  </p>
                  <p className="mt-0.5 max-w-full truncate text-center font-display text-sm font-extrabold tabular-nums text-foreground sm:text-lg">
                    <span className="phone:hidden">{format(row.revenue)}</span>
                    <span className="hidden phone:inline">{formatCompact(row.revenue, lang)}</span>
                  </p>
                  <p className="mt-0.5 text-center text-[10px] tabular-nums text-muted-foreground sm:text-xs">
                    {t("lb.podiumLine", {
                      n: row.wonLeads,
                      pct: Math.round(row.conversion * 10) / 10,
                    })}
                  </p>
                </div>
              ) : (
                <p className="pb-2 text-xs text-subtle">—</p>
              )}
              <div
                className={cn(
                  "mt-3 flex w-full items-start justify-center rounded-t-xl border border-b-0 bg-gradient-to-b pt-2",
                  style.pedestal,
                  style.height,
                )}
              >
                <span className={cn("font-display text-2xl font-black sm:text-3xl", style.numeral)}>
                  {place + 1}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
