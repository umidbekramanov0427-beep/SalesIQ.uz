// Ombor (warehouse) rules that need no database: stock status and the
// repeat-sale forecast (when a client's goods run out, from the gaps
// between their own delivered orders).

export type StockState = "ok" | "low" | "out";

/** Free stock (on hand minus reserved) against the product's minimum. */
export function stockState(qty: number, reserved: number, minStock: number): StockState {
  const free = qty - reserved;
  if (free <= 0) return "out";
  if (minStock > 0 && free < minStock) return "low";
  return "ok";
}

export type RepeatOrder = {
  leadId: string | null;
  status: string;
  total: number;
  deliveredAt: string | null;
  createdAt: string;
  productIds: string[];
};

export type RepeatCandidate = {
  leadId: string;
  orders: number;
  totalSpent: number;
  avgCheck: number;
  /** Average days between the client's orders (null with one order and no fallback). */
  intervalDays: number | null;
  lastAt: string;
  /** When the next order is expected (last + interval). */
  dueAt: string | null;
  /** Days from `now` to dueAt: negative = overdue. */
  dueInDays: number | null;
  /** Products in their orders, most often first. */
  usualProducts: string[];
};

const DAY = 86_400_000;

/**
 * One row per client with at least one delivered order. A client with a
 * single order gets `fallbackDays` (the company's typical gap) as interval.
 */
export function repeatCandidates(
  orders: RepeatOrder[],
  now: Date = new Date(),
  fallbackDays: number | null = 30,
): RepeatCandidate[] {
  const byLead = new Map<string, RepeatOrder[]>();
  for (const o of orders) {
    if (!o.leadId || o.status !== "delivered") continue;
    byLead.set(o.leadId, [...(byLead.get(o.leadId) ?? []), o]);
  }
  const out: RepeatCandidate[] = [];
  for (const [leadId, list] of byLead) {
    const times = list
      .map((o) => Date.parse(o.deliveredAt ?? o.createdAt))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (!times.length) continue;
    let interval: number | null = fallbackDays;
    if (times.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) gaps.push((times[i]! - times[i - 1]!) / DAY);
      interval = Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
    const last = times[times.length - 1]!;
    const due = interval == null ? null : last + interval * DAY;
    const totalSpent = list.reduce((s, o) => s + (o.total || 0), 0);
    const counts = new Map<string, number>();
    for (const o of list)
      for (const p of new Set(o.productIds)) counts.set(p, (counts.get(p) ?? 0) + 1);
    out.push({
      leadId,
      orders: list.length,
      totalSpent,
      avgCheck: Math.round(totalSpent / list.length),
      intervalDays: interval,
      lastAt: new Date(last).toISOString(),
      dueAt: due == null ? null : new Date(due).toISOString(),
      dueInDays: due == null ? null : Math.round((due - now.getTime()) / DAY),
      usualProducts: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p),
    });
  }
  return out.sort((a, b) => (a.dueInDays ?? 1e9) - (b.dueInDays ?? 1e9));
}

/** Clients whose goods run out within `days` (or already did, but not long ago). */
export function dueSoon(list: RepeatCandidate[], days = 7, staleAfter = 60): RepeatCandidate[] {
  return list.filter(
    (c) => c.dueInDays != null && c.dueInDays <= days && c.dueInDays >= -staleAfter,
  );
}

/** Clients silent for longer than `days` past their expected order. */
export function dormant(list: RepeatCandidate[], days = 60): RepeatCandidate[] {
  return list.filter((c) => c.dueInDays != null && c.dueInDays < -days);
}

/** Default stages of a new warehouse funnel and the order status each stands for. */
export const WAREHOUSE_STAGES: {
  name: string;
  color: string;
  orderStatus: string | null;
  stageValue: "new" | "in_work" | "expected" | "sale" | "refused";
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}[] = [
  { name: "Yangi mijoz", color: "#94A3B8", orderStatus: null, stageValue: "new", probability: 10 },
  {
    name: "Buyurtma",
    color: "#3B82F6",
    orderStatus: "new",
    stageValue: "in_work",
    probability: 40,
  },
  {
    name: "Tayyorlanmoqda",
    color: "#F59E0B",
    orderStatus: "preparing",
    stageValue: "in_work",
    probability: 60,
  },
  {
    name: "Yig'ilmoqda",
    color: "#8B5CF6",
    orderStatus: "picking",
    stageValue: "expected",
    probability: 75,
  },
  {
    name: "Yo'lda",
    color: "#0EA5E9",
    orderStatus: "shipped",
    stageValue: "expected",
    probability: 90,
  },
  {
    name: "Yetkazildi",
    color: "#10B981",
    orderStatus: "delivered",
    stageValue: "sale",
    probability: 100,
    isWon: true,
  },
  {
    name: "Bekor qilindi",
    color: "#EF4444",
    orderStatus: "cancelled",
    stageValue: "refused",
    probability: 0,
    isLost: true,
  },
];
