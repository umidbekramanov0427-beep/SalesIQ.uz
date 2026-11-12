import {
  filterTeamTasks,
  isOverdue,
  periodStart,
  statsByAssignee,
  taskStats,
  type TeamTask,
} from "@/lib/team-tasks";

const NOW = new Date("2026-11-12T12:00:00").getTime();
const past = new Date(NOW - 3_600_000).toISOString();
const future = new Date(NOW + 3_600_000).toISOString();
const task = (over: Partial<TeamTask>): TeamTask => ({
  id: Math.random().toString(36),
  status: "Todo",
  priority: "Normal",
  due_date: future,
  assignee_id: "a",
  ...over,
});

describe("team tasks", () => {
  it("counts done, in progress and overdue, and the share done", () => {
    const list = [
      task({ status: "Done", due_date: past }),
      task({ status: "In progress" }),
      task({ status: "Todo", due_date: past }),
      task({ status: "Review", due_date: null }),
    ];
    expect(taskStats(list, NOW)).toEqual({
      total: 4,
      done: 1,
      inProgress: 2,
      overdue: 1,
      donePct: 25,
    });
    expect(taskStats([], NOW).donePct).toBe(0);
    expect(isOverdue({ status: "Done", due_date: past }, NOW)).toBe(false);
  });

  it("puts the person with most overdue first", () => {
    const rows = statsByAssignee(
      [
        task({ assignee_id: "a", status: "Done" }),
        task({ assignee_id: "b", due_date: past }),
        task({ assignee_id: "b", due_date: past }),
        task({ assignee_id: null }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.assigneeId)).toEqual(["b", null, "a"]);
    expect(rows[0]).toMatchObject({ total: 2, overdue: 2, donePct: 0 });
  });

  it("filters by person and priority", () => {
    const list = [
      task({ id: "1", assignee_id: "a", priority: "High" }),
      task({ id: "2", assignee_id: "b", priority: "Urgent" }),
      task({ id: "3", assignee_id: "a", priority: "Low" }),
    ];
    expect(filterTeamTasks(list, "a", []).map((t) => t.id)).toEqual(["1", "3"]);
    expect(filterTeamTasks(list, "all", ["Urgent", "High"]).map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("starts the week on Monday and the month on the 1st", () => {
    // 2026-11-12 is a Thursday.
    expect(periodStart("week", NOW).getDate()).toBe(9);
    expect(periodStart("month", NOW).getDate()).toBe(1);
    expect(periodStart("30d", NOW).getTime()).toBe(NOW - 30 * 86_400_000);
  });
});
