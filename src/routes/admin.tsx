import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader, SectionCard, SettingsLayout } from "@/components/layout/Primitives";
import {
  CatalogGroupSection,
  SetupProgress,
  useAdminCatalog,
} from "@/components/admin/AdminCatalog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — SalesIQ" },
      {
        name: "description",
        content: "Employee and role management for workspace administrators.",
      },
      { property: "og:title", content: "Admin Panel — SalesIQ" },
      { property: "og:description", content: "Roles, permissions and workspace administration." },
    ],
  }),
  component: AdminPanel,
});

function AdminPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
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

  // Every page the admin panel opens (rights, security, AI agents, amoCRM,
  // CRM settings and their sub-pages) shares the settings layout.
  return (
    <SettingsLayout variant="admin">
      {pathname !== "/admin" ? <Outlet /> : <AdminHub />}
    </SettingsLayout>
  );
}

// The admin panel itself: every setting as a card, grouped, one level deep.
function AdminHub() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        tone="primary"
        title={t("admin.title")}
        description={t("hub.desc")}
      />
      <SetupProgress groups={groups} />
      <div className="space-y-8">
        {groups.map((g) => (
          <CatalogGroupSection key={g.key} group={g} />
        ))}
      </div>
    </>
  );
}
