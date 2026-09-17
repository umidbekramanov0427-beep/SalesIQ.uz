import { createFileRoute } from "@tanstack/react-router";
import { Lock, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { PermissionsTable } from "@/components/admin/PermissionsTable";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/permissions")({
  head: () => ({
    meta: [
      { title: "Huquqlar jadvali — SalesIQ" },
      {
        name: "description",
        content: "Har bir rol qaysi CRM amallarni bajara olishini boshqaring.",
      },
    ],
  }),
  component: PermissionsPage,
});

function PermissionsPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("stages.permissions")} description={t("stages.permissionsDesc")} />
      <SectionCard
        className="border-2 border-destructive/30"
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
            <Lock className="h-3.5 w-3.5" />
            {t("stages.permissionsImportant")}
          </span>
        }
      >
        <PermissionsTable />
      </SectionCard>
    </>
  );
}
