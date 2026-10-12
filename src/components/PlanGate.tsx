import { useEffect } from "react";
import { trail } from "@/lib/session-trail";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { minPlanForFeature, PLAN_LABELS, type Feature } from "@/lib/plan-gating";
import { useOrgAccess } from "@/lib/use-org-access";

// Wraps a whole page: if the org can't use `feature` right now, shows why
// instead of the page's real content -- either its plan doesn't include it
// (names the actual tier that unlocks it), or it's still in its free trial
// and this is one of the features a trial withholds until the first payment.
export function PlanGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { t } = useI18n();
  const access = useOrgAccess();
  const reason = access.lockReason(feature);

  // The visits report notes what a company tried to open but couldn't.
  useEffect(() => {
    if (reason) trail("blocked", `feature:${feature}`, undefined, { reason });
  }, [reason, feature]);

  if (!reason) return <>{children}</>;

  const title =
    reason === "trial"
      ? t("planGate.trialTitle")
      : reason === "expired"
        ? t("planGate.expiredTitle")
        : t("planGate.title", { plan: PLAN_LABELS[minPlanForFeature(feature)] });
  const description =
    reason === "trial"
      ? t("planGate.trialDesc")
      : reason === "expired"
        ? t("planGate.expiredDesc")
        : t("planGate.desc");

  return (
    <SectionCard title={title} description={description}>
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
