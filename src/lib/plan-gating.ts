// Shared, client+server-safe definitions for the three SalesIQ pricing
// tiers. Keeping the feature matrix and seat limits here (not duplicated
// between UI gates and server-route checks) is what makes "gated" mean the
// same thing everywhere -- a route enforces access with the exact same
// planHasFeature() call a nav item used to decide whether to render.

export type Plan = "start_iq" | "analyst_iq" | "master_iq";

export const PLANS: Plan[] = ["start_iq", "analyst_iq", "master_iq"];

export const PLAN_LABELS: Record<Plan, string> = {
  start_iq: "Start IQ",
  analyst_iq: "Analyst IQ",
  master_iq: "Master IQ",
};

// A brand-new org (self-signup, or created by the platform owner without
// picking a plan) starts here -- matches organizations.plan's own db
// default and the CHECK constraint in 20261012000000_pricing_tiers.sql.
export const DEFAULT_PLAN: Plan = "start_iq";

export function normalizePlan(plan: string | null | undefined): Plan {
  return plan === "analyst_iq" || plan === "master_iq" ? plan : "start_iq";
}

// Every gate in the app is one of these. Adding a new gated capability
// means adding one entry here and deciding which tier(s) include it --
// never a hardcoded plan-name comparison at the call site.
export type Feature =
  // Dashboard/Funnels/Audio Analytics/Lead Analytics/custom report
  // builder/daily report -- anything whose whole point is analyzing sales
  // activity rather than just recording it.
  | "analytics"
  // AmoCRM/Bitrix24 continuous sync -- feeds the analytics above for an org
  // that runs its real CRM elsewhere and only wants insight here.
  | "integrations"
  // Stage-change automation / workflow builder.
  | "automation"
  // Native telephony (click-to-call, call logs, OnlinePBX/Sipuni/MoiZvonki).
  | "telephony"
  // Segmented bulk messaging campaigns (WhatsApp/SMS/Email/Telegram).
  | "bulk_messaging"
  // E-signature / contract generation.
  | "esignature"
  // Web form builder + public form pages.
  | "web_forms"
  // Taking data out of the platform: Excel/CSV, PDF, Google Sheets export.
  // Every paid plan has it; it's one of the things a free trial withholds
  // (see TRIAL_LOCKED_FEATURES in org-access.ts).
  | "exports"
  // The ad-hoc/custom report builder.
  | "report_builder";

const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  start_iq: new Set<Feature>(["exports"]),
  analyst_iq: new Set<Feature>(["analytics", "integrations", "exports", "report_builder"]),
  master_iq: new Set<Feature>([
    "analytics",
    "integrations",
    "automation",
    "telephony",
    "bulk_messaging",
    "esignature",
    "web_forms",
    "exports",
    "report_builder",
  ]),
};

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  return PLAN_FEATURES[normalizePlan(plan)].has(feature);
}

// The lowest tier that includes a given feature -- used for "Upgrade to
// {plan}" prompts so the message names the actual tier to buy, not just
// "upgrade your plan".
export function minPlanForFeature(feature: Feature): Plan {
  return PLANS.find((plan) => PLAN_FEATURES[plan].has(feature)) ?? "master_iq";
}

// Included seats per plan. null = unlimited (master_iq). An org can be
// granted more than this by the platform owner (organizations.extra_seats,
// see effectiveSeatLimit below) at extra_seat_price_uzs/month per seat.
// Every profile counts toward this, including a sales-rep row
// auto-provisioned by AmoCRM/Bitrix24 sync (see syncUserMapping in each
// integration's client.server.ts) -- importing a CRM's leads/deals is
// never blocked, but actually LOGGING IN with one of those accounts is,
// ranked by who was added first (see check_seat_login in
// 20261012010000_seat_login_check.sql, the real point of enforcement, and
// admin/create-employee.ts for the equivalent check on manual invites).
export const SEAT_LIMITS: Record<Plan, number | null> = {
  start_iq: 3,
  analyst_iq: 20,
  master_iq: null,
};

// null = unlimited. Adds any platform-owner-granted extra_seats on top of
// the plan's included limit.
export function effectiveSeatLimit(
  plan: string | null | undefined,
  extraSeats: number,
): number | null {
  const base = SEAT_LIMITS[normalizePlan(plan)];
  return base === null ? null : base + Math.max(0, extraSeats);
}

// A plan's own price plus its granted extra seats, each billed at
// extraSeatPriceUzs/month -- the number an org actually owes next renewal,
// computed automatically from plan + extra_seats rather than a price the
// platform owner has to keep recalculating and re-entering by hand.
export function effectivePriceUzs(
  plan: string | null | undefined,
  extraSeats: number,
  planPrices: Record<Plan, number>,
  extraSeatPriceUzs: number,
): number {
  return planPrices[normalizePlan(plan)] + Math.max(0, extraSeats) * extraSeatPriceUzs;
}
