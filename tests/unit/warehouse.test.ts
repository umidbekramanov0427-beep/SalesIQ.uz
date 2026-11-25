import { dormant, dueSoon, repeatCandidates, stockState } from "@/lib/warehouse";

describe("stockState", () => {
  it("counts reserved goods as gone", () => {
    expect(stockState(10, 10, 0)).toBe("out");
    expect(stockState(10, 5, 8)).toBe("low");
    expect(stockState(10, 0, 8)).toBe("ok");
    expect(stockState(3, 0, 0)).toBe("ok");
  });
});

describe("repeatCandidates", () => {
  const now = new Date("2026-11-25T00:00:00Z");
  const o = (leadId: string, date: string, total: number, p: string[] = ["a"]) => ({
    leadId,
    status: "delivered",
    total,
    deliveredAt: date,
    createdAt: date,
    productIds: p,
  });

  it("uses the client's own average gap", () => {
    const [c] = repeatCandidates(
      [o("L", "2026-09-25T00:00:00Z", 100), o("L", "2026-10-25T00:00:00Z", 300, ["a", "b"])],
      now,
    );
    expect(c!.orders).toBe(2);
    expect(c!.intervalDays).toBe(30);
    expect(c!.avgCheck).toBe(200);
    expect(c!.dueInDays).toBe(-1);
    expect(c!.usualProducts[0]).toBe("a");
  });

  it("falls back for a single order and skips undelivered ones", () => {
    const list = repeatCandidates(
      [
        o("A", "2026-11-20T00:00:00Z", 50),
        { ...o("B", "2026-11-01T00:00:00Z", 10), status: "shipped" },
      ],
      now,
      14,
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.dueInDays).toBe(9);
  });

  it("splits due-soon and dormant clients", () => {
    const list = repeatCandidates(
      [o("soon", "2026-10-28T00:00:00Z", 1), o("old", "2026-05-01T00:00:00Z", 1)],
      now,
      30,
    );
    expect(dueSoon(list).map((c) => c.leadId)).toEqual(["soon"]);
    expect(dormant(list).map((c) => c.leadId)).toEqual(["old"]);
  });
});
