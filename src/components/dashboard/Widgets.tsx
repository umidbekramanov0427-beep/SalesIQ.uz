import { useMemo } from "react";
import { CircleAlert, Sparkles, ListChecks, Activity } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useHotLeadCount,
  useRecentActivity,
  useUpcomingLeadTasksView,
  useTopPerformers,
  type TaskView,
} from "@/hooks/use-crm-data";

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-mint-foreground">
        <Sparkles className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

export function LeadTasksWidget({ funnel = null }: { funnel?: string | null }) {
  const { t } = useI18n();
  const { rows: leadTasks } = useUpcomingLeadTasksView(funnel);

  const groups: Array<{ label: string; items: TaskView[] }> = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(startOfDay.getTime() + 86400000);
    const weekEnd = new Date(startOfDay.getTime() + 7 * 86400000);
    const today = leadTasks.filter((task) => task.dueRaw && new Date(task.dueRaw) < tomorrow);
    const tmrw = leadTasks.filter(
      (task) =>
        task.dueRaw &&
        new Date(task.dueRaw) >= tomorrow &&
        new Date(task.dueRaw) < new Date(tomorrow.getTime() + 86400000),
    );
    const week = leadTasks.filter(
      (task) =>
        task.dueRaw &&
        new Date(task.dueRaw) >= new Date(tomorrow.getTime() + 86400000) &&
        new Date(task.dueRaw) < weekEnd,
    );
    return [
      { label: t("widget.groupToday"), items: today },
      { label: t("widget.groupTomorrow"), items: tmrw },
      { label: t("widget.groupThisWeek"), items: week },
    ];
  }, [leadTasks, t]);

  return (
    <SectionCard
      icon={ListChecks}
      tone="amber"
      title={t("widget.leadTasksTitle")}
      description={t("widget.leadTasksDesc")}
      info={t("widget.leadTasksInfo")}
    >
      <div className="space-y-5">
        {leadTasks.length === 0 && <p className="text-sm text-subtle">{t("widget.noLeadTasks")}</p>}
        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <div key={g.label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {g.label}
              </p>
              <ul className="space-y-2">
                {g.items.map((task) => (
                  <li
                    key={task.id}
                    className="rounded-xl border border-border p-3 transition-colors duration-150 hover:bg-accent"
                  >
                    <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-subtle">
                      {task.leadName ?? "—"} · {task.assignee}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </SectionCard>
  );
}

export function ActivityWidget({ funnel = null }: { funnel?: string | null }) {
  const { t } = useI18n();
  const { rows: activity } = useRecentActivity(8, funnel);
  return (
    <SectionCard
      icon={Activity}
      tone="primary"
      title={t("widget.activityTitle")}
      description={t("widget.activityDesc")}
      info={t("widget.activityInfo")}
    >
      {activity.length === 0 && <p className="text-sm text-subtle">{t("widget.noActivity")}</p>}
      <ol className="relative space-y-5 border-l border-border pl-5">
        {activity.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
            <p className="text-sm text-foreground">
              <span className="font-medium">{a.who}</span> — {a.what}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
              {a.leadName && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {a.leadName}
                </span>
              )}
              <span>{a.when}</span>
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

export function AiInsightsWidget({
  funnel = null,
  dateRange,
}: {
  funnel?: string | null;
  dateRange?: { from: Date | null; to: Date | null };
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const hotCount = useHotLeadCount(funnel);
  const top = useTopPerformers(1, funnel, dateRange)[0];

  const insights = useMemo(() => {
    const out: {
      id: string;
      tone: "success" | "warning" | "danger" | "info";
      title: string;
      body: string;
    }[] = [];
    if (top && top.revenue > 0) {
      out.push({
        id: "top",
        tone: "success",
        title: t("widget.insightTopTitle", { name: top.name }),
        body: t("widget.insightTopBody", { revenue: format(top.revenue), deals: top.deals }),
      });
    }
    if (hotCount) {
      out.push({
        id: "hot",
        tone: "warning",
        title: t("widget.insightHotTitle", { count: hotCount }),
        body: t("widget.insightHotBody"),
      });
    }
    if (out.length === 0) {
      out.push({
        id: "empty",
        tone: "info",
        title: t("widget.insightEmptyTitle"),
        body: t("widget.insightEmptyBody"),
      });
    }
    return out;
  }, [hotCount, top, t, format]);

  const insightTone = {
    danger: "bg-destructive/10 text-destructive",
    success: "bg-mint text-mint-foreground",
    warning: "bg-warning/15 text-warning-foreground",
    info: "bg-primary/10 text-primary",
  } as const;

  return (
    <SectionCard
      icon={Sparkles}
      tone="violet"
      title={t("widget.aiInsightsTitle")}
      description={t("widget.aiInsightsDesc")}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((i) => (
          <article
            key={i.id}
            className="rounded-xl border border-border p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-elevated"
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold",
                insightTone[i.tone],
              )}
            >
              <CircleAlert className="h-3 w-3" />
              {t("widget.insightBadge")}
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">{i.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{i.body}</p>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
