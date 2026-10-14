import { bucketFunnelTasks, leadShortId } from "@/components/crm/FunnelTasksBoard";
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

describe("leadShortId", () => {
  it("is the first 8 characters of the id", () => {
    expect(leadShortId("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0")).toBe("0f1e2d3c");
  });
});
