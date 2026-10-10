import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { appRoleOf, type AppRole } from "@/lib/nav";

// Wraps a page (or part of one) that only some company roles may open --
// e.g. report settings for ROP and super admin. Everyone else gets the
// same "restricted" notice as the other gated pages, and nothing inside
// mounts (so its data hooks never run).
export function RoleGate({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const role = appRoleOf(user);
  if (!user) return null;
  if (role && roles.includes(role)) return <>{children}</>;
  return (
    <SectionCard
      icon={ShieldAlert}
      tone="rose"
      title={t("admin.restrictedTitle")}
      description={t("admin.restrictedDesc")}
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
      </div>
    </SectionCard>
  );
}
