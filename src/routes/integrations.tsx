import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutGrid, Plug, Waypoints } from "lucide-react";
import { AdminChrome, PageHeader, SettingsLayout } from "@/components/layout/Primitives";
import { useAdminCatalog } from "@/components/admin/AdminCatalog";
import {
  AdminSectionCrumb,
  AdminSectionStrip,
  ConnectionMap,
} from "@/components/admin/ConnectionMap";
import { IntegrationsMarket } from "@/components/integrations/IntegrationsMarket";
import { Segmented } from "@/components/ui/segmented";
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

// Two views of the same integrations: the console's map (the sections that
// connect SalesIQ to the outside around it) and the store-style catalog
// (search, categories, "O'rnatilgan", big logos). The last view is
// remembered on this browser.
type View = "map" | "catalog";
const VIEW_KEY = "salesiq.integrations.view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "catalog" ? "catalog" : "map";
  } catch {
    return "map";
  }
}

function IntegrationsCatalog() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const [view, setViewState] = useState<View>("map");
  useEffect(() => setViewState(readView()), []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private window: the choice just isn't remembered */
    }
  };
  const shown = groups.filter(
    (g) => g.key === "integrations" || g.key === "bots" || g.key === "telephony",
  );
  return (
    <>
      <PageHeader
        title={t("int.title")}
        description={t("hub.integrationsDesc")}
        icon={Plug}
        actions={
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "map", label: t("market.viewMap"), icon: Waypoints },
              { value: "catalog", label: t("market.viewCatalog"), icon: LayoutGrid },
            ]}
          />
        }
      />
      {view === "catalog" ? (
        <IntegrationsMarket items={shown.flatMap((g) => g.items)} />
      ) : (
        <ConnectionMap groups={shown} mode="groups" />
      )}
    </>
  );
}
