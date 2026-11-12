// Xodimlar vazifalari (Vazifalar -> Xodimlar): how each person is doing with
// their tasks in a period -- how many they have, what share is done, how
// many are in progress and how many are overdue. Pure, unit-tested; the
// view (components/crm/TeamTasksView.tsx) feeds it the period's tasks.

export const TASK_STATUSES = ["Todo", "In progress", "Review", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TeamTask = {
  id: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
};

export type TaskStats = {
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
  /** Whole percent of the tasks that are done (0 when there are none). */
  donePct: number;
};

/** Overdue = not done and its due time has passed. */
export function isOverdue(task: Pick<TeamTask, "status" | "due_date">, now: number): boolean {
  return task.status !== "Done" && !!task.due_date && new Date(task.due_date).getTime() < now;
}

export function taskStats(tasks: readonly TeamTask[], now: number): TaskStats {
  let done = 0;
  let overdue = 0;
  let inProgress = 0;
  for (const t of tasks) {
    if (t.status === "Done") done++;
    else if (isOverdue(t, now)) overdue++;
    else inProgress++;
  }
  const total = tasks.length;
  return {
    total,
    done,
    inProgress,
    overdue,
    donePct: total ? Math.round((done / total) * 100) : 0,
  };
}

export type AssigneeStats = TaskStats & { assigneeId: string | null };

/** One line per person (null = nobody assigned): most overdue first, then by share done. */
export function statsByAssignee(tasks: readonly TeamTask[], now: number): AssigneeStats[] {
  const groups = new Map<string | null, TeamTask[]>();
  for (const t of tasks) {
    const k = t.assignee_id ?? null;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups]
    .map(([assigneeId, list]) => ({ assigneeId, ...taskStats(list, now) }))
    .sort((a, b) => b.overdue - a.overdue || a.donePct - b.donePct || b.total - a.total);
}

/** The filter on top of the view: one person (or everyone) and the chosen priorities. */
export function filterTeamTasks<T extends TeamTask>(
  tasks: readonly T[],
  assigneeId: string | "all",
  priorities: readonly TaskPriority[],
): T[] {
  return tasks.filter(
    (t) =>
      (assigneeId === "all" || t.assignee_id === assigneeId) &&
      (priorities.length === 0 || priorities.includes(t.priority)),
  );
}

export type TeamPeriod = "week" | "month" | "30d";

/** Where the period starts: Monday of this week, the 1st of this month, or 30 days ago. */
export function periodStart(period: TeamPeriod, now: number): Date {
  const d = new Date(now);
  if (period === "week") {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return monday;
  }
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(now - 30 * 86_400_000);
}
