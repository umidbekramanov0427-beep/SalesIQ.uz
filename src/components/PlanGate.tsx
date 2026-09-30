import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { minPlanForFeature, planHasFeature, PLAN_LABELS, type Feature } from "@/lib/plan-gating";

// Wraps a whole page: if the org's own plan doesn't include `feature`, shows
// an upsell notice (same "restricted" card shape as PermissionGate) instead
// of the page's real content, naming the actual tier that unlocks it.
export function PlanGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();

  if (!planHasFeature(user?.orgPlan, feature)) {
    const requiredPlan = minPlanForFeature(feature);
    return (
      <SectionCard
        title={t("planGate.title", { plan: PLAN_LABELS[requiredPlan] })}
        description={t("planGate.desc")}
      >
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" /> {t("planGate.hint")}
          </div>
          <Link
            to="/billing"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("planGate.cta")}
          </Link>
        </div>
      </SectionCard>
    );
  }

  return <>{children}</>;
}
