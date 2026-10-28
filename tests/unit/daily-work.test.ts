import { dailyWork, isPaymentStage } from "@/lib/daily-work";

const stages = [
  { id: "new", name: "Yangi", is_won: false, is_lost: false },
  { id: "half", name: "Yarim to'lov", is_won: false, is_lost: false },
  { id: "pre", name: "Predoplata qildi", is_won: false, is_lost: false },
  { id: "won", name: "WON | To'liq to'lov", is_won: true, is_lost: false },
  { id: "lost", name: "Yopildi", is_won: false, is_lost: true },
];
const lead = (id: string, stage: string, extra: Record<string, unknown> = {}) => ({
  id,
  funnel: "Sotuv",
  owner_id: "m1",
  stage_id: stage,
  budget: null,
  expected_revenue: null,
  ...extra,
});
const now = new Date("2026-10-28T10:00:00");

describe("dailyWork", () => {
  it("knows payment stages", () => {
    expect(isPaymentStage("Yarim to'lov")).toBe(true);
    expect(isPaymentStage("Peredoplata")).toBe(true);
    expect(isPaymentStage("To'liq to'lov")).toBe(false);
  });

  it("counts what needs doing today", () => {
    const leads = [
      lead("a", "new"),
      lead("b", "new", { owner_id: null, funnel: "Kurs" }),
      lead("c", "half", { expected_revenue: 3_000_000 }),
      lead("d", "pre", { budget: 1_000_000 }),
      lead("e", "won"),
      lead("f", "lost"),
    ];
    const tasks = [
      { lead_id: "a", due_date: "2026-10-27T09:00:00" },
      { lead_id: "a", due_date: "2026-10-28T08:00:00" },
      { lead_id: "c", due_date: "2026-10-28T18:00:00" },
      { lead_id: "d", due_date: "2026-10-30T09:00:00" },
    ];
    const w = dailyWork(leads, tasks, stages, now);
    expect(w.overdue.count).toBe(2);
    expect(w.today.count).toBe(1);
    expect(w.noTask).toMatchObject({ count: 1, funnel: "Kurs" });
    expect(w.unassigned.count).toBe(1);
    expect(w.payment).toMatchObject({ count: 2, amount: 4_000_000, funnel: "Sotuv" });
    expect(w.payment.stageIds).toEqual(["half", "pre"]);
    expect(w.empty).toBe(false);
  });

  it("is empty without CRM leads or tasks", () => {
    expect(dailyWork([], [], stages, now).empty).toBe(true);
  });
});
