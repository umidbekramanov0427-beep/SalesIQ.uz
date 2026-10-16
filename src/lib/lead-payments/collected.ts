// The dashboard's "Yig'ilgan to'lovlar": money a company's clients really
// paid through its Payme / Click payment links in the chosen period, next
// to the links still waiting to be paid. Pure, so the sums are unit-tested.

export type CollectedRow = {
  id: string;
  lead_id: string;
  amount: number;
  status: string;
  provider: string | null;
  paid_at: string | null;
  created_at: string;
  lead_name: string | null;
};

export type CollectedSummary = {
  paidTotal: number;
  paidCount: number;
  payme: number;
  click: number;
  pendingTotal: number;
  pendingCount: number;
  /** Newest paid first, at most `recentLimit`. */
  recent: CollectedRow[];
};

export function summarizeCollected(
  rows: CollectedRow[],
  range: { from: Date | null; to: Date | null },
  recentLimit = 5,
): CollectedSummary {
  const from = range.from?.getTime() ?? -Infinity;
  const to = range.to?.getTime() ?? Infinity;
  const paid = rows
    .filter((r) => r.status === "paid" && r.paid_at)
    .filter((r) => {
      const at = new Date(r.paid_at!).getTime();
      return at >= from && at <= to;
    })
    .sort((a, b) => (a.paid_at! < b.paid_at! ? 1 : -1));
  // Waiting links are shown as they are now, whatever the period.
  const pending = rows.filter((r) => r.status === "pending");
  const sum = (list: CollectedRow[]) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
  return {
    paidTotal: sum(paid),
    paidCount: paid.length,
    payme: sum(paid.filter((r) => r.provider === "payme")),
    click: sum(paid.filter((r) => r.provider === "click")),
    pendingTotal: sum(pending),
    pendingCount: pending.length,
    recent: paid.slice(0, recentLimit),
  };
}
