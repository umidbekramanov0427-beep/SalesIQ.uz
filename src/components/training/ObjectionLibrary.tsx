import { useMemo, useState } from "react";
import { Lightbulb, Loader2, MessageSquareQuote, ShieldQuestion, Trophy } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useProfilesRaw, useSalesInsights } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ObjectionGroup } from "@/lib/sales-insights";

// Sinfxona → E'tirozlar: the objections clients raise in the team's own
// analysed calls, grouped (price, "I'll think", trust...), with the best
// answers the team's managers gave -- the deals that were sold first --
// and the AI's suggestion. Grouping: src/lib/sales-insights.ts.

const PERIODS = [30, 90, 365] as const;

function Group({ g, names }: { g: ObjectionGroup; names: Map<string, string> }) {
  const { t } = useI18n();
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldQuestion className="h-[18px] w-[18px]" />
        </span>
        <h3 className="text-[16px] font-extrabold text-foreground">
          {t(`objection.kind.${g.kind}`)}
        </h3>
        <span className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
          <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 tabular-nums text-muted-foreground">
            {t("objection.count", { n: String(g.count) })}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 tabular-nums",
              g.handledRate >= 60
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/10 text-red-700 dark:text-red-300",
            )}
          >
            {t("objection.handled", { n: String(g.handledRate) })}
          </span>
          {g.wonRate != null && (
            <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 tabular-nums text-muted-foreground">
              {t("objection.won", { n: String(g.wonRate) })}
            </span>
          )}
        </span>
      </header>
      {g.samples.length > 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          {t("objection.clientSays")}{" "}
          {g.samples.map((s, i) => (
            <span key={i} className="font-medium text-foreground">
              «{s}»{i < g.samples.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      )}
      <div className="mt-4 space-y-2.5">
        {g.best.length === 0 ? (
          <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-[13px] text-muted-foreground">
            {t("objection.noBest")}
          </p>
        ) : (
          g.best.map((b, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="flex items-start gap-2 text-[14px] leading-relaxed text-foreground">
                <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{b.response}</span>
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[12px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">
                  {(b.ownerId && names.get(b.ownerId)) || t("objection.manager")}
                </span>
                {b.score != null && (
                  <span className="tabular-nums">
                    · {t("objection.score", { n: String(b.score) })}
                  </span>
                )}
                {b.won && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-1.5 py-px font-bold text-emerald-700 dark:text-emerald-300">
                    <Trophy className="h-3 w-3" /> {t("objection.sold")}
                  </span>
                )}
              </p>
            </div>
          ))
        )}
        {g.suggestion && (
          <p className="flex items-start gap-2 rounded-xl bg-violet-500/8 px-4 py-3 text-[13px] text-foreground">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>
              <span className="font-bold">{t("objection.aiTip")}</span> {g.suggestion}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}

export function ObjectionLibrary() {
  const { t } = useI18n();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(90);
  const range = useMemo(() => {
    const from = new Date(Date.now() - days * 86_400_000);
    from.setHours(0, 0, 0, 0);
    return { from, to: null };
  }, [days]);
  const { data, isLoading, error } = useSalesInsights({ funnel: null, ...range });
  const { data: profiles } = useProfilesRaw();
  const names = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
    [profiles],
  );
  return (
    <SectionCard
      icon={ShieldQuestion}
      tone="amber"
      title={t("objection.title")}
      description={t("objection.desc")}
      actions={
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-semibold",
                days === d ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              {t("objection.days", { n: String(d) })}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("insights.failed")}</p>
      ) : !data || data.objections.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("objection.empty")}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.objections.map((g) => (
            <Group key={g.kind} g={g} names={names} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
