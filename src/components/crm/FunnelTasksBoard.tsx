import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock, CalendarClock, CalendarDays, Clock3, Phone, UserRound } from "lucide-react";
import type { CrmLeadView, FunnelOpenTask } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Vazifalar" inside a funnel: every open task on the funnel's (filtered)
// leads, split by its due time -- overdue (red), still due today (green),
// tomorrow and later (blue). One card per task, so the counts are task
// counts; a lead with two tasks shows up twice. A card opens the lead.

export type TaskBucket = "overdue" | "today" | "upcoming";

export type TaskBoardItem = {
  taskId: string;
  title: string;
  dueIso: string;
  dueAt: number;
  lead: CrmLeadView;
};

/** Splits open tasks of the given leads into the three columns, each sorted by due time. */
export function bucketFunnelTasks(
  leads: CrmLeadView[],
  tasks: FunnelOpenTask[],
  now: number,
): Record<TaskBucket, TaskBoardItem[]> {
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setHours(24, 0, 0, 0);
  const tomorrow = startOfTomorrow.getTime();
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  const out: Record<TaskBucket, TaskBoardItem[]> = { overdue: [], today: [], upcoming: [] };
  for (const task of tasks) {
    if (!task.lead_id || !task.due_date) continue;
    const lead = leadsById.get(task.lead_id);
    if (!lead) continue;
    const dueAt = new Date(task.due_date).getTime();
    if (Number.isNaN(dueAt)) continue;
    const item = { taskId: task.id, title: task.title, dueIso: task.due_date, dueAt, lead };
    if (dueAt < now) out.overdue.push(item);
    else if (dueAt < tomorrow) out.today.push(item);
    else out.upcoming.push(item);
  }
  // Longest overdue first; today and later in the order they come up.
  for (const k of Object.keys(out) as TaskBucket[]) out[k].sort((a, b) => a.dueAt - b.dueAt);
  return out;
}

/** Re-renders every 30 s so a task slides from "today" to "overdue" on time. */
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const TONES: Record<
  TaskBucket,
  { bar: string; chip: string; text: string; soft: string; ring: string; icon: typeof AlarmClock }
> = {
  overdue: {
    bar: "bg-red-500",
    chip: "bg-red-500 text-white",
    text: "text-red-600 dark:text-red-400",
    soft: "bg-red-500/10 text-red-700 dark:text-red-300",
    ring: "hover:border-red-500/50",
    icon: AlarmClock,
  },
  today: {
    bar: "bg-emerald-500",
    chip: "bg-emerald-500 text-white",
    text: "text-emerald-600 dark:text-emerald-400",
    soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ring: "hover:border-emerald-500/50",
    icon: Clock3,
  },
  upcoming: {
    bar: "bg-sky-500",
    chip: "bg-sky-500 text-white",
    text: "text-sky-600 dark:text-sky-400",
    soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    ring: "hover:border-sky-500/50",
    icon: CalendarDays,
  },
};

const pad = (n: number) => String(n).padStart(2, "0");
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateOf = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** The short lead number people search by: the first 8 characters of its id. */
export function leadShortId(id: string): string {
  return id.slice(0, 8);
}

export function FunnelTasksBoard({
  leads,
  tasks,
}: {
  leads: CrmLeadView[];
  tasks: FunnelOpenTask[];
}) {
  const { t } = useI18n();
  const now = useNowTick();
  const buckets = useMemo(() => bucketFunnelTasks(leads, tasks, now), [leads, tasks, now]);

  const columns: { key: TaskBucket; title: string; empty: string }[] = [
    { key: "overdue", title: t("ftasks.overdue"), empty: t("ftasks.emptyOverdue") },
    { key: "today", title: t("ftasks.today"), empty: t("ftasks.emptyToday") },
    { key: "upcoming", title: t("ftasks.upcoming"), empty: t("ftasks.emptyUpcoming") },
  ];

  return (
    <div className="grid gap-3 pb-4 lg:grid-cols-3">
      {columns.map((col) => {
        const tone = TONES[col.key];
        const items = buckets[col.key];
        const Icon = tone.icon;
        return (
          <section
            key={col.key}
            aria-label={col.title}
            className="flex min-h-[200px] flex-col rounded-2xl border border-border bg-card/60"
          >
            <header className="px-4 pb-3 pt-3.5">
              <div className="flex items-center gap-2">
                <span className={cn("grid h-8 w-8 place-items-center rounded-xl", tone.soft)}>
                  <Icon className="h-4 w-4" />
                </span>
                <h2 className="flex-1 truncate text-[13.5px] font-extrabold uppercase tracking-wide text-foreground">
                  {col.title}
                </h2>
                <span
                  className={cn(
                    "min-w-[28px] rounded-full px-2 py-0.5 text-center text-[12.5px] font-extrabold tabular-nums",
                    tone.chip,
                  )}
                >
                  {items.length}
                </span>
              </div>
            </header>
            <span className={cn("mx-4 mb-3 h-[3px] rounded-full", tone.bar)} />
            <div className="flex-1 space-y-2 px-3 pb-3">
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-[12.5px] font-medium text-muted-foreground">
                  {col.empty}
                </p>
              ) : (
                items.map((item, i) => {
                  const due = new Date(item.dueIso);
                  // "Upcoming" is split by day: Ertaga, then each date.
                  const prev = i > 0 ? new Date(items[i - 1]!.dueIso) : null;
                  const newDay = col.key === "upcoming" && (!prev || dayKey(prev) !== dayKey(due));
                  return (
                    <div key={item.taskId}>
                      {newDay && (
                        <p className="mb-1.5 mt-1 px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
                          {isTomorrow(due, now) ? t("ftasks.tomorrow") : dateOf(due)}
                        </p>
                      )}
                      <TaskCard item={item} bucket={col.key} now={now} />
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function isTomorrow(d: Date, now: number): boolean {
  const tm = new Date(now);
  tm.setDate(tm.getDate() + 1);
  return dayKey(d) === dayKey(tm);
}

function TaskCard({ item, bucket, now }: { item: TaskBoardItem; bucket: TaskBucket; now: number }) {
  const { t } = useI18n();
  const tone = TONES[bucket];
  const due = new Date(item.dueIso);
  const when =
    bucket === "today"
      ? `${t("ftasks.today")}, ${timeOf(due)}`
      : bucket === "upcoming" && isTomorrow(due, now)
        ? `${t("ftasks.tomorrow")}, ${timeOf(due)}`
        : `${dateOf(due)} ${timeOf(due)}`;
  return (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: item.lead.id }}
      search={{ from: "funnels" }}
      className={cn(
        "block rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] hover:shadow-[0_2px_10px_rgba(16,24,40,0.08)]",
        tone.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] font-bold text-foreground">{item.lead.name}</p>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
          ID {leadShortId(item.lead.id)}
        </span>
      </div>
      {item.title && (
        <p className="mt-1 line-clamp-2 text-[12.5px] font-medium text-foreground/80">
          {item.title}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        {item.lead.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" /> {item.lead.phone}
          </span>
        )}
        {item.lead.owner && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <UserRound className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.lead.owner}</span>
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-bold tabular-nums",
            tone.soft,
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {when}
        </span>
        {bucket === "overdue" && (
          <span className={cn("text-[11.5px] font-semibold", tone.text)}>
            {lateLabel(now - item.dueAt, t)}
          </span>
        )}
      </div>
    </Link>
  );
}

function lateLabel(ms: number, t: (k: string, v?: Record<string, string | number>) => string) {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return t("ftasks.lateMinutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("ftasks.lateHours", { n: hours });
  return t("ftasks.lateDays", { n: Math.floor(hours / 24) });
}
