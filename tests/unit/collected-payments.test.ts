import { summarizeCollected, type CollectedRow } from "@/lib/lead-payments/collected";

const row = (p: Partial<CollectedRow>): CollectedRow => ({
  id: Math.random().toString(36),
  lead_id: "l1",
  amount: 100_000,
  status: "paid",
  provider: "payme",
  paid_at: "2026-10-10T10:00:00Z",
  created_at: "2026-10-09T10:00:00Z",
  lead_name: "Aziza",
  ...p,
});

describe("summarizeCollected", () => {
  it("sums paid links inside the period by provider", () => {
    const s = summarizeCollected(
      [
        row({ amount: 300_000 }),
        row({ amount: 200_000, provider: "click", paid_at: "2026-10-12T10:00:00Z" }),
        row({ amount: 999_000, paid_at: "2026-09-01T10:00:00Z" }),
      ],
      { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T23:59:59Z") },
    );
    expect(s.paidTotal).toBe(500_000);
    expect(s.paidCount).toBe(2);
    expect(s.payme).toBe(300_000);
    expect(s.click).toBe(200_000);
    expect(s.recent[0]!.provider).toBe("click");
  });

  it("counts every open link as pending whatever the period, ignores cancelled", () => {
    const s = summarizeCollected(
      [
        row({ status: "pending", paid_at: null, provider: null, amount: 50_000 }),
        row({
          status: "pending",
          paid_at: null,
          provider: null,
          created_at: "2025-01-01T00:00:00Z",
        }),
        row({ status: "cancelled", paid_at: null }),
      ],
      { from: new Date("2026-10-01T00:00:00Z"), to: null },
    );
    expect(s.pendingCount).toBe(2);
    expect(s.pendingTotal).toBe(150_000);
    expect(s.paidCount).toBe(0);
  });

  it("with no period takes all paid links and caps the recent list", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ paid_at: `2026-10-0${i + 1}T10:00:00Z` }),
    );
    const s = summarizeCollected(rows, { from: null, to: null }, 3);
    expect(s.paidCount).toBe(8);
    expect(s.recent).toHaveLength(3);
    expect(s.recent[0]!.paid_at).toBe("2026-10-08T10:00:00Z");
  });
});
