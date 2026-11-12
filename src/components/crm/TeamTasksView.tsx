import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock, CheckCircle2, CircleDashed, ListTodo, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  filterTeamTasks,
  isOverdue,
  periodStart,
  statsByAssignee,
  taskStats,
  type TaskPriority,
  type TaskStatus,
  type TeamPeriod,
} from "@/lib/team-tasks";
import {
  useProfilesRaw,
  useTeamTasks,
  useUpdateTask,
  type TeamTaskRow,
} from "@/hooks/use-crm-data";
import { TaskTypeLabel, useTaskText } from "@/components/crm/TasksExtras";

// Vazifalar -> Xodimlar: how the team is doing with its tasks in a period
// (src/lib/team-tasks.ts) -- the totals, one line per person with the share
// done, and the tasks by status, where a card is dragged to another status.

const STATUS_TONE: Record<TaskStatus, { bar: string; chip: string }> = {
  Todo: { bar: "bg-slate-400", chip: "bg-slate-500/12 text-slate-700 dark:text-slate-300" },
  "In progress": { bar: "bg-sky-500", chip: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  Review: { bar: "bg-amber-400", chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  Done: { bar: "bg-emerald-500", chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
};
const PRIORITY_DOT: Record<TaskPriority, string> = {
  Urgent: "bg-red-500",
  High: "bg-orange-500",
  Normal: "bg-sky-500",
  Low: "bg-slate-400",
};

/** Re-renders every 30 s so a task turns overdue on time. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TeamTasksView() {
  const { t } = useI18n();
  const now = useNow();
  const [period, setPeriod] = useState<TeamPeriod>("month");
  const [who, setWho] = useState<string | "all">("all");
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  // Moves made here show at once; the server's answer replaces them.
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({});
  const fromIso = useMemo(() => periodStart(period, Date.now()).toISOString(), [period]);
  const { data: rows = [], isLoading } = useTeamTasks(fromIso);
  const { data: profiles = [] } = useProfilesRaw();
  const update = useUpdateTask();
  const nameOf = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.full_name ?? t("team.unknown")) : t("team.unassigned");

  const tasks = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        status: (moved[r.id] ?? r.status) as TaskStatus,
        priority: r.priority as TaskPriority,
      })),
    [rows, moved],
  );
  const shown = filterTeamTasks(tasks, who, priorities);
  const totals = taskStats(shown, now);
  const people = statsByAssignee(filterTeamTasks(tasks, "all", priorities), now);
  const assignees = [...new Set(tasks.map((x) => x.assignee_id).filter((v): v is string => !!v))];

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  function moveTo(status: TaskStatus) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    const task = tasks.find((x) => x.id === id);
    if (!id || !task || task.status === status) return;
    setMoved((m) => ({ ...m, [id]: status }));
    update.mutate(
      { id, patch: { status, ...(status === "Done" ? { progress: 100 } : {}) } },
      {
        onSuccess: () => toast.success(t("team.moved", { status: t(`team.status.${status}`) })),
        onError: (err) => {
          setMoved((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
          toast.error(describeError(err, t("team.moveFailed")));
        },
      },
    );
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
      on
        ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      {/* Filters: period, person, priority. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1">
          {(["week", "month", "30d"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={chip(period === p)}
            >
              {t(`team.period.${p}`)}
            </button>
          ))}
        </div>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          aria-label={t("team.who")}
          className="h-10 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
        >
          <option value="all">{t("team.everyone")}</option>
          {assignees.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1">
          {TASK_PRIORITIES.map((p) => {
            const on = priorities.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPriorities((list) => (on ? list.filter((x) => x !== p) : [...list, p]))
                }
                className={chip(on)}
              >
                <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[p])} />
                {t(`amo.priority.${p}`)}
              </button>
            );
          })}
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* The totals. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ListTodo} tone="slate" label={t("team.total")} value={String(totals.total)} />
        <Stat
          icon={CheckCircle2}
          tone="emerald"
          label={t("team.done")}
          value={`${totals.donePct}%`}
          sub={t("team.doneOf", { done: totals.done, total: totals.total })}
          pct={totals.donePct}
        />
        <Stat
          icon={CircleDashed}
          tone="sky"
          label={t("team.inProgress")}
          value={String(totals.inProgress)}
          sub={
            totals.total ? `${Math.round((totals.inProgress / totals.total) * 100)}%` : undefined
          }
        />
        <Stat
          icon={AlarmClock}
          tone="red"
          label={t("team.overdue")}
          value={String(totals.overdue)}
          sub={totals.total ? `${Math.round((totals.overdue / totals.total) * 100)}%` : undefined}
        />
      </div>

      {/* One line per person. */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-[14px] font-bold text-foreground">{t("team.people")}</h3>
          <span className="ml-auto text-[12px] text-muted-foreground">{t("team.peopleHint")}</span>
        </header>
        {people.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            {isLoading ? t("common.loading") : t("team.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            <li
              aria-hidden
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_repeat(3,64px)] gap-3 bg-muted/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle phone:hidden"
            >
              <span>{t("team.who")}</span>
              <span>{t("team.done")}</span>
              <span className="text-right">{t("team.total")}</span>
              <span className="text-right">{t("team.inProgressShort")}</span>
              <span className="text-right">{t("team.overdueShort")}</span>
            </li>
            {people.map((p) => (
              <li key={p.assigneeId ?? "none"}>
                <button
                  type="button"
                  onClick={() => setWho(who === p.assigneeId ? "all" : (p.assigneeId ?? "all"))}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_repeat(3,64px)] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/60 phone:grid-cols-[minmax(0,1fr)_auto]",
                    who === p.assigneeId && "bg-primary/[0.06]",
                  )}
                >
                  <span className="truncate text-[13.5px] font-semibold text-foreground">
                    {nameOf(p.assigneeId)}
                  </span>
                  <span className="flex items-center gap-2 phone:hidden">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${p.donePct}%` }}
                      />
                    </span>
                    <span className="w-10 text-right font-mono text-[12.5px] font-semibold tabular-nums text-foreground">
                      {p.donePct}%
                    </span>
                  </span>
                  <Num label={t("team.total")} value={p.total} />
                  <Num label={t("team.inProgress")} value={p.inProgress} />
                  <Num label={t("team.overdue")} value={p.overdue} danger />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The tasks by status: drag a card to another column. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const items = shown.filter((x) => x.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                moveTo(status);
              }}
              className={cn(
                "flex min-h-[180px] flex-col rounded-2xl border border-border bg-card/60 transition-shadow dark:bg-white/[0.035]",
                over === status && "ring-2 ring-primary/40",
              )}
            >
              <header className="flex items-center gap-2 px-4 pb-2 pt-3">
                <h3 className="flex-1 truncate text-[13px] font-extrabold uppercase tracking-wide text-foreground">
                  {t(`team.status.${status}`)}
                </h3>
                <span
                  className={cn(
                    "min-w-[26px] rounded-full px-2 py-0.5 text-center text-[12px] font-extrabold tabular-nums",
                    STATUS_TONE[status].chip,
                  )}
                >
                  {items.length}
                </span>
              </header>
              <span className={cn("mx-4 mb-2.5 h-[3px] rounded-full", STATUS_TONE[status].bar)} />
              <div className="flex-1 space-y-2 px-3 pb-3">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                    {t("team.dropHere")}
                  </p>
                ) : (
                  items.slice(0, 40).map((x) => (
                    <TeamTaskCard
                      key={x.id}
                      task={x}
                      owner={nameOf(x.assignee_id)}
                      overdue={isOverdue(x, now)}
                      dragging={dragging === x.id}
                      onDragStart={() => setDragging(x.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    />
                  ))
                )}
                {items.length > 40 && (
                  <p className="text-center text-[12px] text-muted-foreground">
                    {t("team.more", { n: items.length - 40 })}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const STAT_TONE = {
  slate: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  red: "bg-red-500/12 text-red-700 dark:text-red-300",
} as const;

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  pct,
}: {
  icon: typeof ListTodo;
  tone: keyof typeof STAT_TONE;
  label: string;
  value: string;
  sub?: string | undefined;
  pct?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", STAT_TONE[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[30px] font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        {sub && <span className="text-[12.5px] text-muted-foreground">{sub}</span>}
      </div>
      {pct !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Num({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <span
      title={label}
      className={cn(
        "text-right font-mono text-[13px] font-semibold tabular-nums phone:hidden",
        danger && value > 0 ? "text-red-600 dark:text-red-400" : "text-foreground/80",
      )}
    >
      {value}
    </span>
  );
}

function TeamTaskCard({
  task,
  owner,
  overdue,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: TeamTaskRow & { status: TaskStatus; priority: TaskPriority };
  owner: string;
  overdue: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useI18n();
  const text = useTaskText()(task.title);
  const due = task.due_date ? new Date(task.due_date) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px] font-bold text-foreground">
          {task.lead?.name ?? text ?? task.title}
        </span>
        <span
          title={t(`amo.priority.${task.priority}`)}
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority])}
        />
      </div>
      <div className="mt-0.5">
        <TaskTypeLabel title={task.title} />
      </div>
      {text && task.lead && (
        <p className="mt-1 line-clamp-2 text-[12.5px] text-foreground/80">{text}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate text-muted-foreground">{owner}</span>
        {due && (
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
              overdue
                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {pad(due.getDate())}.{pad(due.getMonth() + 1)} {pad(due.getHours())}:
            {pad(due.getMinutes())}
          </span>
        )}
      </div>
    </>
  );
  const cls = cn(
    "block cursor-grab rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[opacity,border-color] hover:border-primary/40 active:cursor-grabbing",
    overdue && task.status !== "Done" && "border-l-[3px] border-l-red-500",
    dragging && "opacity-40",
  );
  return task.lead_id ? (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: task.lead_id }}
      search={{ from: "funnels" }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cls}
    >
      {body}
    </Link>
  ) : (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className={cls}>
      {body}
    </div>
  );
}
