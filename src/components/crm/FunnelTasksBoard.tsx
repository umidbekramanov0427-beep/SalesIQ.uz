import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock3,
  Phone,
  UserRound,
} from "lucide-react";
import {
  useBoardChatInfo,
  usePipelineStagesRaw,
  type CrmLeadView,
  type FunnelOpenTask,
} from "@/hooks/use-crm-data";
import {
  CompleteTaskButton,
  NewTaskDialog,
  TaskCalendar,
  TaskTypeLabel,
  TasksToolbar,
  useTaskText,
  type TasksView,
} from "@/components/crm/TasksExtras";
import { leadNumber } from "@/components/crm/KanbanLeadCard";
import { TeamTasksView } from "@/components/crm/TeamTasksView";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Vazifalar" inside a funnel: every open task on the funnel's (filtered)
// leads, split by its due time -- overdue (red), still due today (green),
// tomorrow (blue) and later (violet, by this week / this month / after). One card per task, so the counts are task
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

export type LaterPart = "tomorrow" | "week" | "month" | "later";

/**
 * Splits the "upcoming" tasks (already sorted) like amoCRM's task board:
 * tomorrow, the rest of this week (weeks start on Monday), the rest of
 * this month, and everything after that.
 */
export function splitUpcoming(
  items: TaskBoardItem[],
  now: number,
): Record<LaterPart, TaskBoardItem[]> {
  const d = new Date(now);
  const day = (n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
  const dayAfterTomorrow = day(2);
  const nextMonday = day(7 - ((d.getDay() + 6) % 7));
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const out: Record<LaterPart, TaskBoardItem[]> = { tomorrow: [], week: [], month: [], later: [] };
  for (const item of items) {
    if (item.dueAt < dayAfterTomorrow) out.tomorrow.push(item);
    else if (item.dueAt < nextMonday) out.week.push(item);
    else if (item.dueAt < nextMonth) out.month.push(item);
    else out.later.push(item);
  }
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

type ColKey = "overdue" | "today" | "tomorrow" | "later";

const TONES: Record<
  ColKey,
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
  tomorrow: {
    bar: "bg-sky-500",
    chip: "bg-sky-500 text-white",
    text: "text-sky-600 dark:text-sky-400",
    soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    ring: "hover:border-sky-500/50",
    icon: CalendarDays,
  },
  later: {
    bar: "bg-violet-500",
    chip: "bg-violet-500 text-white",
    text: "text-violet-600 dark:text-violet-400",
    soft: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    ring: "hover:border-violet-500/50",
    icon: CalendarRange,
  },
};

const pad = (n: number) => String(n).padStart(2, "0");
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateOf = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

export function FunnelTasksBoard({
  leads,
  tasks,
}: {
  leads: CrmLeadView[];
  tasks: FunnelOpenTask[];
}) {
  const { t } = useI18n();
  const now = useNowTick();
  const [view, setView] = useState<TasksView>("columns");
  const [addOpen, setAddOpen] = useState(false);
  // Long columns show 30 cards, then "Yana ko'rsatish" adds 30 more.
  const [limit, setLimit] = useState<Record<ColKey, number>>({
    overdue: 30,
    today: 30,
    tomorrow: 30,
    later: 30,
  });
  const buckets = useMemo(() => bucketFunnelTasks(leads, tasks, now), [leads, tasks, now]);
  const total = buckets.overdue.length + buckets.today.length + buckets.upcoming.length;
  const parts = useMemo(() => splitUpcoming(buckets.upcoming, now), [buckets.upcoming, now]);
  // The last column keeps its own headings: this week, this month, later.
  const laterItems = useMemo(
    () =>
      (["week", "month", "later"] as const).flatMap((p) =>
        parts[p].map((item) => ({ item, part: p })),
      ),
    [parts],
  );
  const partCount = {
    week: parts.week.length,
    month: parts.month.length,
    later: parts.later.length,
  };
  const partTitle = {
    week: t("ftasks.weekRest"),
    month: t("ftasks.monthRest"),
    later: t("ftasks.later"),
  };
  const { data: stages = [] } = usePipelineStagesRaw();
  const stageColor = useMemo(() => new Map(stages.map((st) => [st.id, st.color])), [stages]);
  // The leads' short numbers, as on the funnel cards.
  const taskLeadIds = useMemo(
    () => [...new Set(tasks.map((x) => x.lead_id).filter((id): id is string => !!id))],
    [tasks],
  );
  const numbers = useBoardChatInfo(taskLeadIds).data?.numbers;

  const columns: { key: ColKey; title: string; empty: string }[] = [
    { key: "overdue", title: t("ftasks.overdue"), empty: t("ftasks.emptyOverdue") },
    { key: "today", title: t("ftasks.today"), empty: t("ftasks.emptyToday") },
    { key: "tomorrow", title: t("ftasks.tomorrow"), empty: t("ftasks.emptyTomorrow") },
    { key: "later", title: t("ftasks.upcoming"), empty: t("ftasks.emptyLater") },
  ];

  const toolbar = (
    <>
      <TasksToolbar view={view} onView={setView} count={total} onAdd={() => setAddOpen(true)} />
      <NewTaskDialog open={addOpen} onOpenChange={setAddOpen} leads={leads} />
    </>
  );
  // Xodimlar: the team's tasks in a period, by person and by status.
  if (view === "team")
    return (
      <div className="pb-4">
        {toolbar}
        <TeamTasksView />
      </div>
    );
  if (view !== "columns")
    return (
      <div className="pb-4">
        {toolbar}
        <TaskCalendar
          mode={view}
          items={[...buckets.overdue, ...buckets.today, ...buckets.upcoming]}
          now={now}
        />
      </div>
    );

  return (
    <div className="pb-4">
      {toolbar}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const tone = TONES[col.key];
          const rows =
            col.key === "later"
              ? laterItems
              : (col.key === "tomorrow" ? parts.tomorrow : buckets[col.key]).map((item) => ({
                  item,
                  part: null,
                }));
          const items = rows.map((r) => r.item);
          const Icon = tone.icon;
          return (
            <section
              key={col.key}
              aria-label={col.title}
              className="flex min-h-[200px] flex-col rounded-2xl border border-border bg-card/60 dark:bg-white/[0.035]"
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
                  rows.slice(0, limit[col.key]).map(({ item, part }, i) => {
                    const newPart = part && (i === 0 || rows[i - 1]!.part !== part);
                    return (
                      <div key={item.taskId}>
                        {newPart && (
                          <p
                            className={cn(
                              "mb-1.5 flex items-center justify-between px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground",
                              i > 0 && "mt-3",
                            )}
                          >
                            {partTitle[part]}
                            <span className="tabular-nums">{partCount[part]}</span>
                          </p>
                        )}
                        <TaskCard
                          item={item}
                          bucket={col.key}
                          now={now}
                          stageColor={stageColor.get(item.lead.stageId) ?? null}
                          number={leadNumber({
                            id: item.lead.id,
                            leadNumber: numbers?.get(item.lead.id) ?? null,
                          })}
                        />
                      </div>
                    );
                  })
                )}
                {items.length > limit[col.key] && (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => ({ ...l, [col.key]: l[col.key] + 30 }))}
                    className="w-full rounded-xl border border-border py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("ftasks.showMore", { n: items.length - limit[col.key] })}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  item,
  bucket,
  now,
  number,
  stageColor,
}: {
  item: TaskBoardItem;
  bucket: ColKey;
  now: number;
  number: string;
  stageColor: string | null;
}) {
  const { t } = useI18n();
  const text = useTaskText()(item.title);
  const chip = stageColor?.startsWith("#") ? stageColor : null;
  const tone = TONES[bucket];
  const due = new Date(item.dueIso);
  const when =
    bucket === "today"
      ? `${t("ftasks.today")}, ${timeOf(due)}`
      : bucket === "tomorrow"
        ? `${t("ftasks.tomorrow")}, ${timeOf(due)}`
        : `${dateOf(due)} ${timeOf(due)}`;
  return (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: item.lead.id }}
      search={{ from: "funnels" }}
      className={cn(
        "block rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] hover:shadow-[0_2px_10px_rgba(16,24,40,0.08)] dark:border-white/[0.08] dark:bg-[color-mix(in_oklab,var(--card),black_18%)]",
        tone.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] font-bold text-foreground">{item.lead.name}</p>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
            #{number}
          </span>
          <CompleteTaskButton item={item} />
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <TaskTypeLabel title={item.title} />
        {item.lead.stage && (
          <span
            className={cn(
              "max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              !chip && "bg-muted text-muted-foreground",
            )}
            style={chip ? { backgroundColor: `${chip}26`, color: chip } : undefined}
          >
            {item.lead.stage}
          </span>
        )}
      </div>
      {text && (
        <p className="mt-1 line-clamp-2 text-[12.5px] font-medium text-foreground/80">{text}</p>
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
