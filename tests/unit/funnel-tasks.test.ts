import { bucketFunnelTasks, splitUpcoming } from "@/components/crm/FunnelTasksBoard";
import { leadNumber } from "@/components/crm/KanbanLeadCard";
import type { CrmLeadView, FunnelOpenTask } from "@/hooks/use-crm-data";

const lead = (id: string) => ({ id, name: `Lead ${id}` }) as unknown as CrmLeadView;
const task = (id: string, leadId: string | null, due: Date | null): FunnelOpenTask => ({
  id,
  lead_id: leadId,
  due_date: due ? due.toISOString() : null,
  title: `Task ${id}`,
  assignee_id: null,
});

describe("bucketFunnelTasks", () => {
  // 14 Oct 2026, 15:00 local time.
  const now = new Date(2026, 9, 14, 15, 0).getTime();
  const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
  const leads = [lead("a"), lead("b")];

  it("splits by due time and sorts each column", () => {
    const out = bucketFunnelTasks(
      leads,
      [
        task("t1", "a", at(14, 14, 59)), // an hour ago
        task("t2", "b", at(12, 9)), // two days ago
        task("t3", "a", at(14, 15, 1)), // later today
        task("t4", "b", at(14, 23, 59)), // last minute of today
        task("t5", "a", at(15, 0)), // midnight -> tomorrow
        task("t6", "b", at(20, 10)),
      ],
      now,
    );
    expect(out.overdue.map((i) => i.taskId)).toEqual(["t2", "t1"]);
    expect(out.today.map((i) => i.taskId)).toEqual(["t3", "t4"]);
    expect(out.upcoming.map((i) => i.taskId)).toEqual(["t5", "t6"]);
  });

  it("counts every task, so a lead with two tasks appears twice", () => {
    const out = bucketFunnelTasks(
      leads,
      [task("x", "a", at(13, 9)), task("y", "a", at(13, 10))],
      now,
    );
    expect(out.overdue).toHaveLength(2);
  });

  it("skips tasks without a due date, without a lead, or on leads outside the funnel", () => {
    const out = bucketFunnelTasks(
      leads,
      [task("n1", "a", null), task("n2", null, at(16, 9)), task("n3", "zzz", at(16, 9))],
      now,
    );
    expect(out.overdue.length + out.today.length + out.upcoming.length).toBe(0);
  });
});

describe("leadNumber", () => {
  it("is the lead_number column when set", () => {
    expect(leadNumber({ id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", leadNumber: 100002 })).toBe(
      "100002",
    );
  });
  it("falls back to six stable digits from the id", () => {
    const n = leadNumber({ id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", leadNumber: null });
    expect(n).toMatch(/^\d{6}$/);
    expect(n).toBe(leadNumber({ id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0" }));
  });
});

describe("splitUpcoming", () => {
  // Wednesday 14 Oct 2026, 15:00 local time.
  const now = new Date(2026, 9, 14, 15, 0).getTime();
  const item = (id: string, due: Date) =>
    ({ taskId: id, title: id, dueIso: due.toISOString(), dueAt: due.getTime() }) as never;

  it("splits into tomorrow, rest of the week, rest of the month and later", () => {
    const out = splitUpcoming(
      [
        item("tomorrow-midnight", new Date(2026, 9, 15, 0, 0)),
        item("tomorrow-late", new Date(2026, 9, 15, 23, 59)),
        item("friday", new Date(2026, 9, 16, 10)),
        item("sunday", new Date(2026, 9, 18, 23, 59)),
        item("next-monday", new Date(2026, 9, 19, 0, 0)),
        item("oct-31", new Date(2026, 9, 31, 12)),
        item("nov-1", new Date(2026, 10, 1, 0, 0)),
      ],
      now,
    );
    const ids = (k: keyof typeof out) => out[k].map((i: { taskId: string }) => i.taskId);
    expect(ids("tomorrow")).toEqual(["tomorrow-midnight", "tomorrow-late"]);
    expect(ids("week")).toEqual(["friday", "sunday"]);
    expect(ids("month")).toEqual(["next-monday", "oct-31"]);
    expect(ids("later")).toEqual(["nov-1"]);
  });

  it("on a Sunday the rest of the week is empty", () => {
    const sunday = new Date(2026, 9, 18, 9).getTime();
    const out = splitUpcoming([item("monday", new Date(2026, 9, 19, 9))], sunday);
    expect(out.tomorrow.length).toBe(1);
    expect(out.week.length).toBe(0);
  });
});
