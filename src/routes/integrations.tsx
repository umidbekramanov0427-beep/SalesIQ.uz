import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { AdminChrome, PageHeader, SettingsLayout } from "@/components/layout/Primitives";
import { CatalogGroupSection, useAdminCatalog } from "@/components/admin/AdminCatalog";
import {
  AdminSectionCrumb,
  AdminSectionStrip,
  ConnectionMap,
} from "@/components/admin/ConnectionMap";
import { useI18n } from "@/lib/i18n";

// Every working integration as a card; each opens its own page
// (/integrations/<name>, see integrations.$slug.tsx).
// The console caption and section row every page under this layout shows.
const ADMIN_CHROME = { Crumb: AdminSectionCrumb, Strip: AdminSectionStrip };

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — SalesIQ" },
      {
        name: "description",
        content: "Connect amoCRM, Bitrix24, telephony, SMS, email and Telegram to SalesIQ.",
      },
    ],
  }),
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AdminChrome.Provider value={ADMIN_CHROME}>
      <SettingsLayout variant="admin">
        {pathname.replace(/\/$/, "") !== "/integrations" ? <Outlet /> : <IntegrationsCatalog />}
      </SettingsLayout>
    </AdminChrome.Provider>
  );
}

function IntegrationsCatalog() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const shown = groups.filter(
    (g) => g.key === "integrations" || g.key === "bots" || g.key === "telephony",
  );
  return (
    <>
      <PageHeader title={t("int.title")} description={t("hub.integrationsDesc")} icon={Plug} />
      <ConnectionMap groups={groups} />
      <div className="space-y-8">
        {shown.map((g) => (
          <CatalogGroupSection key={g.key} group={g} />
        ))}
      </div>
    </>
  );
}
