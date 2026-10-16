// The /pricing calculator: what a team of N managers pays per month on each
// plan, and per manager. A plan's price covers its seat limit (SEAT_LIMITS);
// past Master IQ's limit each extra seat costs extraSeat. Analyst IQ and
// Start IQ can't grow past their limit, so a bigger team doesn't fit them.
import { SEAT_LIMITS, type Plan } from "@/lib/plan-gating";

export const PLAN_ORDER: Plan[] = ["start_iq", "analyst_iq", "master_iq"];

export type PlanCost = {
  plan: Plan;
  fits: boolean;
  /** Monthly total in so'm; null when the team doesn't fit or the price isn't set. */
  total: number | null;
  perManager: number | null;
};

export function planCostFor(
  plan: Plan,
  managers: number,
  prices: Record<Plan, number>,
  extraSeat: number,
): PlanCost {
  const n = Math.max(1, Math.floor(managers));
  const limit = SEAT_LIMITS[plan];
  const price = prices[plan];
  const over = limit === null ? 0 : Math.max(0, n - limit);
  const canGrow = plan === "master_iq" && extraSeat > 0;
  const fits = over === 0 || canGrow;
  if (!fits || !(price > 0)) return { plan, fits, total: null, perManager: null };
  const total = price + over * extraSeat;
  return { plan, fits, total, perManager: Math.round(total / n) };
}

export function teamCosts(
  managers: number,
  prices: Record<Plan, number>,
  extraSeat: number,
): PlanCost[] {
  return PLAN_ORDER.map((p) => planCostFor(p, managers, prices, extraSeat));
}
