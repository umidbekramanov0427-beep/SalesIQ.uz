import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  Flame,
  Hourglass,
  Loader2,
  LogIn,
  Plug,
  Send,
  Snowflake,
  Sun,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TrialTemp } from "@/lib/trial-score";
import {
  usePlatformInsightAction,
  usePlatformTrialHealth,
  type PlatformTrialHealth,
} from "@/hooks/use-crm-data";

// The visits report's "On trial" tab: every company on its free trial with
// an engagement score (hot / warm / cold), what it has done and what's
// missing, so the owner knows whom to call. The same data feeds the daily
// Telegram digest, which can also be sent from here on demand.

const TEMP_STYLE: Record<TrialTemp, { icon: LucideIcon; chip: string; bar: string }> = {
  hot: { icon: Flame, chip: "bg-rose-500/12 text-rose-600", bar: "bg-rose-500" },
  warm: { icon: Sun, chip: "bg-amber-500/15 text-amber-700", bar: "bg-amber-500" },
  cold: { icon: Snowflake, chip: "bg-sky-500/12 text-sky-600", bar: "bg-sky-500" },
};

export function TrialsPanel({ onExport }: { onExport?: (rows: PlatformTrialHealth[]) => void }) {
  const { t } = useI18n();
  const { data, isLoading, error } = usePlatformTrialHealth();
  const action = usePlatformInsightAction();

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  const count = (temp: TrialTemp) => data.trials.filter((x) => x.temp === temp).length;
  const summary: { label: string; value: number; tone: string }[] = [
    { label: t("visits.trialTotal"), value: data.trials.length, tone: "text-foreground" },
    { label: t("visits.temp.hot"), value: count("hot"), tone: "text-rose-600" },
    { label: t("visits.temp.warm"), value: count("warm"), tone: "text-amber-700" },
    { label: t("visits.temp.cold"), value: count("cold"), tone: "text-sky-600" },
    {
      label: t("visits.newSignups"),
      value: data.newSignupsYesterday,
      tone: "text-foreground",
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="phone-joined grid flex-1 grid-cols-5 gap-2 phone:basis-full phone:grid-cols-3">
          {summary.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {s.label}
              </p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", s.tone)}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-center gap-2 phone:basis-full phone:flex-row">
          <button
            type="button"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { action: "digest" },
                {
                  onSuccess: (r) =>
                    toast.success(r.sent ? t("visits.digestSent") : t("visits.digestEmpty")),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 phone:flex-1"
          >
            {action.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("visits.digestNow")}
          </button>
          {onExport && (
            <button
              type="button"
              onClick={() => onExport(data.trials)}
              disabled={!data.trials.length}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50 phone:flex-1"
            >
              {t("visits.excel")}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-subtle">{t("visits.digestHint")}</p>

      {data.trials.length === 0 ? (
        <p className="mt-4 text-sm text-subtle">{t("visits.noTrials")}</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 phone:grid-cols-1">
          {data.trials.map((x) => (
            <TrialCard key={x.org.id} trial={x} />
          ))}
        </div>
      )}

      {data.expiredUnpaid.length > 0 && (
        <section className="mt-5 rounded-2xl border border-warning/40 bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Hourglass className="h-4 w-4 text-warning-foreground" /> {t("visits.expiredUnpaid")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.expiredUnpaid.map((o) => (
              <li key={o.id}>
                <Link
                  to="/platform/usage/$orgId"
                  params={{ orgId: o.id }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {o.name}
                  {o.trialEndsAt && (
                    <span className="font-normal text-subtle">
                      · {new Date(o.trialEndsAt).toLocaleDateString()}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TrialCard({ trial: x }: { trial: PlatformTrialHealth }) {
  const { t } = useI18n();
  const style = TEMP_STYLE[x.temp];
  const Icon = style.icon;
  const facts: { icon: LucideIcon; text: string }[] = [
    { icon: LogIn, text: t("visits.signIns7d", { n: String(x.sessions7d) }) },
    {
      icon: Users,
      text: t("visits.activeUsers", { n: String(x.activeUsers7d), total: String(x.users) }),
    },
    { icon: Target, text: t("visits.leadsN", { n: String(x.leads) }) },
    {
      icon: Plug,
      text: x.integrations.length ? x.integrations.join(", ") : t("visits.noIntegration"),
    },
  ];

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", style.chip)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{x.org.name}</p>
          <p className="text-xs text-subtle">
            {x.daysLeft === null
              ? t("visits.trial")
              : x.daysLeft === 0
                ? t("visits.endsToday")
                : t("visits.daysLeft", { n: String(x.daysLeft) })}
          </p>
        </div>
        <span className={cn("rounded-lg px-2 py-1 text-[11px] font-bold", style.chip)}>
          {t(`visits.temp.${x.temp}`)}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-muted-foreground">{t("visits.score")}</span>
          <span className="font-semibold tabular-nums text-foreground">{x.score} / 100</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
          <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${x.score}%` }} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs">
        {facts.map((f) => (
          <p key={f.text} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <f.icon className="h-3.5 w-3.5 shrink-0 text-subtle" />
            <span className="truncate">{f.text}</span>
          </p>
        ))}
        <p className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-subtle" />
          {x.lastSeenAt
            ? t("visits.lastSeen", { when: new Date(x.lastSeenAt).toLocaleString() })
            : t("visits.neverSignedIn")}
        </p>
      </dl>

      {x.gaps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {x.gaps.map((g) => (
            <span
              key={g}
              className="rounded-lg bg-warning/15 px-2 py-1 text-[11px] font-semibold text-warning-foreground"
            >
              {t(`visits.gap.${g}`)}
            </span>
          ))}
        </div>
      )}

      <Link
        to="/platform/usage/$orgId"
        params={{ orgId: x.org.id }}
        className="mt-3 inline-flex items-center gap-1.5 self-start text-xs font-semibold text-primary hover:underline"
      >
        <BarChart3 className="h-3.5 w-3.5" /> {t("visits.usageLink")}
      </Link>
    </article>
  );
}
