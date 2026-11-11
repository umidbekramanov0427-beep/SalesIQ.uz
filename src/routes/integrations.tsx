import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BadgeCheck,
  Bell,
  Code2,
  CreditCard,
  LayoutGrid,
  MessagesSquare,
  Phone,
  Plug,
  Search,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { AdminChrome, PageHeader, SettingsLayout } from "@/components/layout/Primitives";
import {
  cardDescKey,
  cardTitleKey,
  useAdminCatalog,
  type CatalogItem,
} from "@/components/admin/AdminCatalog";
import {
  AdminSectionCrumb,
  AdminSectionStrip,
  ConnectionMap,
} from "@/components/admin/ConnectionMap";
import {
  CATEGORY_ORDER,
  filterMarket,
  isInstalled,
  marketCategory,
  type Shelf,
} from "@/lib/integrations-market";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

// The integrations as the console's map: the sections that connect SalesIQ
// to the outside (integrations, bots, telephony) around it. The store-style
// search and shelves (amoMarket) stay in the same map: picking a shelf or
// typing puts that shelf's services around a core of its own, the way the
// Admin panel's search does -- no separate card grid.
const SHELF_ICON: Record<Shelf, LucideIcon> = {
  all: LayoutGrid,
  installed: BadgeCheck,
  crm: Workflow,
  messengers: MessagesSquare,
  telephony: Phone,
  payments: CreditCard,
  notify: Bell,
  dev: Code2,
};

function IntegrationsCatalog() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");
  const shown = groups.filter(
    (g) => g.key === "integrations" || g.key === "bots" || g.key === "telephony",
  );
  const all = shown.flatMap((g) => g.items);
  const onShelves = all.filter((it) => marketCategory(it.key));
  const text = (it: CatalogItem) =>
    `${t(cardTitleKey(it))} ${t(cardDescKey(it))} ${
      marketCategory(it.key) ? t(`market.cat.${marketCategory(it.key)}`) : ""
    }`;
  const count = (s: Shelf) => (s === "all" ? all : filterMarket(onShelves, s, "", text)).length;
  const shelves: Shelf[] = ["all", "installed", ...CATEGORY_ORDER.filter((c) => count(c) > 0)];
  const shelfLabel = (s: Shelf) =>
    s === "all"
      ? t("market.all")
      : s === "installed"
        ? t("market.installed")
        : t(`market.cat.${s}`);
  const picking = shelf !== "all" || !!query.trim();
  const matches = filterMarket(shelf === "all" ? all : onShelves, shelf, query, text);
  const installed = onShelves.filter(isInstalled).length;

  return (
    <>
      <PageHeader
        title={t("int.title")}
        description={t("hub.integrationsDesc")}
        icon={Plug}
        actions={
          <label className="relative phone:w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("market.search")}
              className="h-10 w-[260px] rounded-xl border border-border bg-input pl-9 pr-3 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary phone:w-full"
            />
          </label>
        }
      />

      {/* The shelves, in the console's filter style. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="radiogroup"
          aria-label={t("market.categories")}
          className="phone-tabs flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-input p-1 [scrollbar-width:none]"
        >
          {shelves.map((s) => {
            const Icon = SHELF_ICON[s];
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={shelf === s}
                onClick={() => setShelf(s)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                  shelf === s
                    ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", shelf === s && "text-primary")} />
                {shelfLabel(s)}
                <span className="font-mono text-[11px] tabular-nums text-subtle">{count(s)}</span>
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[12.5px] text-muted-foreground">
          {t("market.summary", { total: onShelves.length })} ·{" "}
          <span className="text-primary">{t("market.summaryOn", { count: installed })}</span>
        </p>
      </div>

      {!picking ? (
        <ConnectionMap groups={shown} mode="groups" />
      ) : matches.length ? (
        <ConnectionMap
          groups={shown}
          items={matches}
          core={{
            title: query.trim() ? t("console.found", { count: matches.length }) : shelfLabel(shelf),
            icon: query.trim() ? Search : SHELF_ICON[shelf],
          }}
        />
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {shelf === "installed" && !query.trim()
            ? t("market.noneInstalled")
            : t("hub.nothingFound")}
        </p>
      )}
    </>
  );
}
