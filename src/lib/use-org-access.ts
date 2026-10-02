import { useAuth } from "@/lib/auth";
import type { Feature } from "@/lib/plan-gating";
import {
  featureLockReason,
  orgPhase,
  trialDaysLeft,
  type LockReason,
  type OrgAccessInput,
  type OrgPhase,
} from "@/lib/org-access";

export type OrgAccess = {
  phase: OrgPhase;
  isTrial: boolean;
  isExpired: boolean;
  trialDaysLeft: number | null;
  has: (feature: Feature) => boolean;
  lockReason: (feature: Feature) => LockReason | null;
};

/** The signed-in user's org phase + feature checks -- the client side of org-access.ts. */
export function useOrgAccess(): OrgAccess {
  const { user } = useAuth();
  const org: OrgAccessInput = {
    plan: user?.orgPlan,
    active: user?.orgActive,
    trial_ends_at: user?.orgTrialEndsAt,
    is_trial: user?.orgIsTrial,
  };
  const phase = orgPhase(org);
  return {
    phase,
    isTrial: phase === "trial",
    isExpired: phase === "expired",
    trialDaysLeft: trialDaysLeft(org),
    has: (feature) => featureLockReason(org, feature) === null,
    lockReason: (feature) => featureLockReason(org, feature),
  };
}
