import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { PageHeader, SettingsLayout } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { CatalogGroupSection, useAdminCatalog } from "@/components/admin/AdminCatalog";
import { useI18n } from "@/lib/i18n";

// Every working integration as a card; each opens its own page
// (/integrations/<name>, see integrations.$slug.tsx).
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
    <SettingsLayout variant="admin">
      {pathname.replace(/\/$/, "") !== "/integrations" ? <Outlet /> : <IntegrationsCatalog />}
    </SettingsLayout>
  );
}

function IntegrationsCatalog() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const integrations = groups.find((g) => g.key === "integrations");
  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("int.title")} description={t("hub.integrationsDesc")} icon={Plug} />
      {integrations && <CatalogGroupSection group={integrations} />}
    </>
  );
}
