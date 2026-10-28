import { ledgerStage, ledgerSummary, nextPaymentState } from "@/lib/lead-payments/ledger";

const stages = [
  {
    id: "new",
    pipeline_name: "Kurs",
    position: 1,
    is_won: false,
    is_lost: false,
    name: "Yangi lid",
  },
  {
    id: "contact",
    pipeline_name: "Kurs",
    position: 2,
    is_won: false,
    is_lost: false,
    name: "Aloqa",
  },
  {
    id: "half",
    pipeline_name: "Kurs",
    position: 3,
    is_won: false,
    is_lost: false,
    name: "Yarim to'lov",
  },
  {
    id: "won",
    pipeline_name: "Kurs",
    position: 4,
    is_won: true,
    is_lost: false,
    name: "To'liq to'lov",
  },
  {
    id: "lost",
    pipeline_name: "Kurs",
    position: 5,
    is_won: false,
    is_lost: true,
    name: "Sotilmadi",
  },
  {
    id: "other-won",
    pipeline_name: "B2B",
    position: 1,
    is_won: true,
    is_lost: false,
    name: "Yutildi",
  },
];

describe("ledgerSummary", () => {
  it("adds payments and counts what is owed", () => {
    expect(ledgerSummary(3_000_000, [{ amount: 1_000_000 }, { amount: 500_000 }])).toEqual({
      total: 3_000_000,
      paid: 1_500_000,
      remaining: 1_500_000,
      percent: 50,
      state: "partial",
    });
  });
  it("is full when paid in full or more, never negative debt", () => {
    const s = ledgerSummary(1_000_000, [{ amount: 1_200_000 }]);
    expect(s.state).toBe("full");
    expect(s.remaining).toBe(0);
    expect(s.percent).toBe(100);
  });
  it("treats any payment on a deal without a sum as full, none as none", () => {
    expect(ledgerSummary(0, [{ amount: 100_000 }]).state).toBe("full");
    expect(ledgerSummary(500_000, []).state).toBe("none");
  });
});

describe("ledgerStage", () => {
  const run = (current: string, total: number, paid: number, configured = {}) =>
    ledgerStage({
      stages,
      currentStageId: current,
      pipeline: "Kurs",
      summary: ledgerSummary(total, paid ? [{ amount: paid }] : []),
      configured,
    });
  it("moves a partly paid lead to the partial-payment stage", () => {
    expect(run("new", 3_000_000, 1_000_000)).toBe("half");
  });
  it("moves a fully paid lead to the won stage, or the configured one", () => {
    expect(run("half", 3_000_000, 3_000_000)).toBe("won");
    expect(run("contact", 1_000_000, 1_000_000, { Kurs: "half" })).toBe("half");
  });
  it("never moves backwards, nor a closed lead", () => {
    expect(run("half", 3_000_000, 500_000)).toBeNull();
    expect(run("lost", 3_000_000, 3_000_000)).toBeNull();
    expect(run("won", 3_000_000, 100_000)).toBeNull();
    expect(run("new", 3_000_000, 0)).toBeNull();
  });
  it("stays when the funnel has no partial stage", () => {
    expect(
      ledgerStage({
        stages,
        currentStageId: null,
        pipeline: "B2B",
        summary: ledgerSummary(2_000_000, [{ amount: 1 }]),
        configured: {},
      }),
    ).toBeNull();
  });
});

describe("nextPaymentState", () => {
  const today = new Date(2026, 9, 28);
  it("tells overdue, today and later apart", () => {
    expect(nextPaymentState("2026-10-27", today)).toBe("overdue");
    expect(nextPaymentState("2026-10-28", today)).toBe("today");
    expect(nextPaymentState("2026-11-05", today)).toBe("later");
    expect(nextPaymentState(null, today)).toBeNull();
  });
});
