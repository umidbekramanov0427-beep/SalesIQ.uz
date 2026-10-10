import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { usePermission } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";

// Wraps a whole page: if the caller's role doesn't have `action` allowed in
// Huquqlar jadvali, shows the same "restricted" notice admin-only pages
// already use instead of the page's real content.
export function PermissionGate({ action, children }: { action: string; children: ReactNode }) {
  const allowed = usePermission(action);
  const { t } = useI18n();

  if (!allowed) {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("permission.restrictedTitle")}
        description={t("permission.restrictedDesc")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("permission.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return <>{children}</>;
}
