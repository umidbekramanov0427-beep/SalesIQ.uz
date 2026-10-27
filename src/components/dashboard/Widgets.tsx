import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  CircleAlert,
  ExternalLink,
  ListChecks,
  Sparkles,
  StickyNote,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useAiLeadTasks,
  useAmoCrmLink,
  useHotLeadCount,
  useRecentActivity,
  useTopPerformers,
  type AiLeadTask,
} from "@/hooks/use-crm-data";

// Rows shown per column; the rest is counted ("yana 40 ta").
const TASKS_PER_COLUMN = 8;

const DAY_MS = 86_400_000;

// "14:30" today, "05.11" on another day (the "uz" locale's month names
// are unreliable across browsers, so the date is built by hand).
function dueLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.toDateString() === new Date().toDateString()
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

function AmoButton({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}

/**
 * Faoliyat: the tasks the call analysis created, in three columns --
 * overdue, today, upcoming -- like the funnel's task board, each with a
 * button that opens the lead in amoCRM.
 */
export function LeadTasksWidget({ funnel = null }: { funnel?: string | null }) {
  const { t } = useI18n();
  const { rows: tasks, isLoading } = useAiLeadTasks(funnel);
  const amoLink = useAmoCrmLink();

  const columns = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrow = start + DAY_MS;
    const at = (task: AiLeadTask) => (task.dueRaw ? new Date(task.dueRaw).getTime() : null);
    return [
      {
        key: "overdue",
        label: t("widget.groupOverdue"),
        tone: "border-t-destructive",
        count: "bg-destructive/10 text-destructive",
        items: tasks.filter((task) => (at(task) ?? Infinity) < start),
      },
      {
        key: "today",
        label: t("widget.groupToday"),
        tone: "border-t-amber-500",
        count: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        items: tasks.filter((task) => {
          const v = at(task);
          return v != null && v >= start && v < tomorrow;
        }),
      },
      {
        key: "upcoming",
        label: t("widget.groupUpcoming"),
        tone: "border-t-primary",
        count: "bg-primary/10 text-primary",
        items: tasks.filter((task) => {
          const v = at(task);
          return v == null || v >= tomorrow;
        }),
      },
    ];
  }, [tasks, t]);

  return (
    <SectionCard
      icon={ListChecks}
      tone="amber"
      title={t("widget.leadTasksTitle")}
      description={t("widget.leadTasksDesc")}
      info={t("widget.leadTasksInfo")}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              "min-w-0 rounded-xl border border-t-4 border-border bg-surface p-2.5",
              col.tone,
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[12px] font-bold uppercase tracking-wide text-foreground">
                {col.label}
              </p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                  col.count,
                )}
              >
                {col.items.length}
              </span>
            </div>
            <ul className="space-y-2 lg:max-h-[560px] lg:overflow-y-auto">
              {isLoading &&
                Array.from({ length: 3 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-[74px] w-full rounded-xl" />
                  </li>
                ))}
              {!isLoading && col.items.length === 0 && (
                <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
                  {t("widget.noLeadTasks")}
                </li>
              )}
              {col.items.slice(0, TASKS_PER_COLUMN).map((task) => (
                <li
                  key={task.id}
                  className="rounded-xl border border-border bg-card p-3 shadow-soft"
                >
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {task.title}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-[11px] text-muted-foreground">
                      <p className="truncate font-medium text-foreground">{task.leadName ?? "—"}</p>
                      <p className="truncate">
                        {task.assignee} · {dueLabel(task.dueRaw)}
                      </p>
                    </div>
                    <AmoButton href={amoLink(task.leadAmoId)} label="amoCRM" />
                  </div>
                </li>
              ))}
            </ul>
            {col.items.length > TASKS_PER_COLUMN && (
              <p className="mt-2 px-1 text-xs text-subtle">
                {t("widget.moreTasks", { n: col.items.length - TASKS_PER_COLUMN })}
              </p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

const ACTIVITY_KIND: Record<string, { icon: LucideIcon; tone: string; key: string }> = {
  ai_note: {
    icon: Sparkles,
    tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    key: "widget.kind.ai",
  },
  note: {
    icon: StickyNote,
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    key: "widget.kind.note",
  },
  stage_change: {
    icon: Workflow,
    tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    key: "widget.kind.stage",
  },
};
const OTHER_KIND = {
  icon: Activity,
  tone: "bg-muted text-muted-foreground",
  key: "widget.kind.other",
};

/**
 * So'nggi faoliyat: one compact line per event -- what happened, the lead,
 * its manager and stage -- with "Tahlilni ko'rish" and "amoCRM" instead of
 * the AI's whole text.
 */
export function ActivityWidget({ funnel = null }: { funnel?: string | null }) {
  const { t } = useI18n();
  const { rows: activity, isLoading } = useRecentActivity(10, funnel);
  const amoLink = useAmoCrmLink();
  return (
    <SectionCard
      icon={Activity}
      tone="primary"
      title={t("widget.activityTitle")}
      description={t("widget.activityDesc")}
      info={t("widget.activityInfo")}
    >
      {!isLoading && activity.length === 0 && (
        <p className="text-sm text-subtle">{t("widget.noActivity")}</p>
      )}
      <ul className="divide-y divide-border">
        {isLoading &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="py-2.5">
              <Skeleton className="h-9 w-full rounded-lg" />
            </li>
          ))}
        {activity.map((a) => {
          const kind = ACTIVITY_KIND[a.type] ?? OTHER_KIND;
          const Icon = kind.icon;
          return (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", kind.tone)}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {a.leadName ?? "—"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {t(kind.key)} · {a.owner ?? t("widget.noOwner")}
                  {a.stage ? ` · ${a.stage}` : ""} · {a.when}
                </p>
              </div>
              <Link
                to="/crm/leads/$leadId"
                params={{ leadId: a.leadId }}
                search={{ from: "audio" }}
                className="inline-flex h-7 shrink-0 items-center rounded-lg bg-primary/10 px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                {t("widget.viewAnalysis")}
              </Link>
              <AmoButton href={amoLink(a.leadAmoId)} label="amoCRM" />
            </li>
          );
        })}
      </ul>
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
