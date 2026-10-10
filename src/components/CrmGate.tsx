import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Blocks, PowerOff } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { useCrmEnabled } from "@/lib/use-org-access";

// Wraps a CRM settings page (funnels, lead sources, telephony, salesbots,
// triggers...): when the company's CRM module is off -- it uses SalesIQ for
// analytics only -- the page explains that instead of rendering, and none
// of its data hooks run. Only the platform owner can switch the module on.
export function CrmGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const enabled = useCrmEnabled();
  if (enabled) return <>{children}</>;
  return (
    <SectionCard
      icon={PowerOff}
      tone="slate"
      title={t("crm.offTitle")}
      description={t("crm.offDesc")}
    >
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Blocks className="h-4 w-4" /> {t("crm.offHint")}
        </div>
        <Link
          to="/admin"
          className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {t("crm.backToAdmin")}
        </Link>
      </div>
    </SectionCard>
  );
}
