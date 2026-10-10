// Client+server-safe. An org is always in exactly one of three phases, and
// every gate in the app (sidebar locks, <PlanGate>, server routes, crons)
// asks the same question through this module so "trial", "paid" and
// "expired" mean the same thing everywhere:
//
//   trial   -- still inside its free trial (organizations.is_trial = true and
//              trial_ends_at in the future). Gets its plan's features MINUS
//              TRIAL_LOCKED_FEATURES, plus the seat and AI-analysis caps
//              below: enough to see what the product does, not to run a
//              business on it for free.
//   paid    -- has paid at least once (a Payme/Click payment, or the platform
//              owner marking it paid for an offline payment) and its period
//              hasn't lapsed. Full plan.
//   expired -- trial_ends_at has passed (or the platform owner suspended it).
//              The whole app is locked except the billing page; data is kept.
import { effectiveSeatLimit, planHasFeature, type Feature } from "./plan-gating";

export type OrgPhase = "trial" | "paid" | "expired";

export type OrgAccessInput = {
  plan: string | null | undefined;
  active: boolean | null | undefined;
  trial_ends_at: string | null | undefined;
  // Missing (null/undefined) reads as "not a trial" -- the column only exists
  // once 20261015000000_trial_mode.sql has run, and an org predating it
  // should never suddenly lose features because the column isn't there yet.
  is_trial?: boolean | null | undefined;
  unlimited_seats?: boolean | null | undefined;
};

export const TRIAL_LOCKED_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  "automation",
  "telephony",
  "bulk_messaging",
  "esignature",
  "web_forms",
  "exports",
  "report_builder",
]);

// Mirrored in check_seat_login (20261015000000_trial_mode.sql) -- keep both
// in sync if this ever changes.
export const TRIAL_SEAT_LIMIT = 3;

// AI call analysis is the one real per-use cost (transcription + Gemini), so
// a free trial gets a fixed allowance of analyzed calls rather than an open
// tap.
export const TRIAL_AI_ANALYSIS_LIMIT = 20;

export function orgPhase(org: OrgAccessInput): OrgPhase {
  if (org.active === false) return "expired";
  if (org.trial_ends_at && new Date(org.trial_ends_at).getTime() < Date.now()) return "expired";
  return org.is_trial ? "trial" : "paid";
}

export type LockReason = "expired" | "plan" | "trial";

/** Why `feature` is unavailable to this org right now, or null if it's available. */
export function featureLockReason(org: OrgAccessInput, feature: Feature): LockReason | null {
  const phase = orgPhase(org);
  if (phase === "expired") return "expired";
  if (!planHasFeature(org.plan, feature)) return "plan";
  if (phase === "trial" && TRIAL_LOCKED_FEATURES.has(feature)) return "trial";
  return null;
}

export function orgHasFeature(org: OrgAccessInput, feature: Feature): boolean {
  return featureLockReason(org, feature) === null;
}

/** The plan's seat limit, capped at TRIAL_SEAT_LIMIT during a trial. null = unlimited. */
export function orgSeatLimit(org: OrgAccessInput, extraSeats: number): number | null {
  const base = effectiveSeatLimit(org.plan, extraSeats, !!org.unlimited_seats);
  if (orgPhase(org) !== "trial") return base;
  return base === null ? TRIAL_SEAT_LIMIT : Math.min(base, TRIAL_SEAT_LIMIT);
}

export function trialDaysLeft(org: OrgAccessInput): number | null {
  if (orgPhase(org) !== "trial" || !org.trial_ends_at) return null;
  const ms = new Date(org.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  "Obuna muddati tugagan. Davom etish uchun obunani faollashtiring.";
export const TRIAL_FEATURE_LOCKED_MESSAGE =
  "Bu funksiya bepul sinov davrida mavjud emas. To'liq foydalanish uchun obunani faollashtiring.";
export const TRIAL_AI_LIMIT_MESSAGE = `Bepul sinov davrida AI ${TRIAL_AI_ANALYSIS_LIMIT} ta qo'ng'iroqni tahlil qiladi -- limit tugadi. Cheksiz tahlil uchun obunani faollashtiring.`;

/** User-facing message for a non-plan lock (expired / trial); plan locks keep each route's own upsell text. */
export function phaseLockMessage(reason: Exclude<LockReason, "plan">): string {
  return reason === "expired" ? SUBSCRIPTION_EXPIRED_MESSAGE : TRIAL_FEATURE_LOCKED_MESSAGE;
}

/** The user-facing error for a server route refusing `feature`, or null if allowed. */
export function featureDeniedMessage(org: OrgAccessInput, feature: Feature): string | null {
  const reason = featureLockReason(org, feature);
  if (reason === "expired") return SUBSCRIPTION_EXPIRED_MESSAGE;
  if (reason === "trial") return TRIAL_FEATURE_LOCKED_MESSAGE;
  if (reason === "plan") return "Sizning tarifingiz bu funksiyani o'z ichiga olmaydi.";
  return null;
}
