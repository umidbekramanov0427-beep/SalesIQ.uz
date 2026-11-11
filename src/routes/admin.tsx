import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  AdminChrome,
  AdminConsoleHeader,
  SectionCard,
  SettingsLayout,
} from "@/components/layout/Primitives";
import {
  CatalogGroupSection,
  SetupProgress,
  cardDescKey,
  cardIsLive,
  cardTitleKey,
  useAdminCatalog,
  type CatalogItem,
} from "@/components/admin/AdminCatalog";
import {
  AdminSectionCrumb,
  AdminSectionStrip,
  ConnectionMap,
} from "@/components/admin/ConnectionMap";
import { BackButton } from "@/components/layout/BackButton";
import { GuideButton } from "@/components/help/GuideButton";
import { useSidebarConfig } from "@/hooks/use-crm-data";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// The console caption and section row every page under this layout shows.
const ADMIN_CHROME = { Crumb: AdminSectionCrumb, Strip: AdminSectionStrip };

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
    <AdminChrome.Provider value={ADMIN_CHROME}>
      <SettingsLayout variant="admin">
        {pathname !== "/admin" ? <Outlet /> : <AdminHub />}
      </SettingsLayout>
    </AdminChrome.Provider>
  );
}

// The admin panel itself, as a console: every setting is a card, grouped,
// one level deep, with the company's connections map on top -- SalesIQ in
// the middle, its services around it, a live cable from each connected one.
type Filter = "all" | "on" | "off";

function AdminHub() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const sidebar = useSidebarConfig();
  const [active, setActive] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pinned = sidebar.pinned;
  // "Ulangan" / "Ulanmagan" only sort the cards that have a state.
  const matchesFilter = (it: CatalogItem) =>
    filter === "all" || ((it.status || it.pinPath) && (filter === "on") === cardIsLive(it, pinned));
  const shown = groups
    .filter((g) => q || active === "all" || g.key === active)
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          matchesFilter(it) &&
          (!q || `${t(cardTitleKey(it))} ${t(cardDescKey(it))}`.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.items.length > 0);
  const all = groups.flatMap((g) => g.items);
  const groupMap =
    !q && filter === "all" && active !== "all"
      ? (groups.find((g) => g.key === active) ?? null)
      : null;
  const stateful = all.filter((it) => it.status || it.pinPath);
  const onCount = stateful.filter((it) => cardIsLive(it, pinned)).length;
  const counts: Record<Filter, number> = {
    all: all.length,
    on: onCount,
    off: stateful.length - onCount,
  };
  return (
    <>
      <BackButton className="mb-5" />
      <AdminConsoleHeader
        caption={t("console.crumb")}
        title={t("admin.title")}
        icon={ShieldCheck}
        summary={
          <>
            {t("console.summary", { total: counts.all })} ·{" "}
            <span className="text-primary">{t("console.summaryOn", { count: counts.on })}</span>
          </>
        }
        actions={
          <>
            <label className="relative phone:w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("hub.search")}
                className="h-10 w-[240px] rounded-xl border border-border bg-input pl-9 pr-3 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary phone:w-full"
              />
            </label>
            <div
              role="radiogroup"
              aria-label={t("console.filterLabel")}
              className="flex h-10 items-center gap-0.5 rounded-xl border border-border bg-input p-1"
            >
              {(["all", "on", "off"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                    filter === f
                      ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`console.filter.${f}`)}
                  <span className="font-mono text-[11px] tabular-nums text-subtle">
                    {counts[f]}
                  </span>
                </button>
              ))}
            </div>
            <GuideButton />
          </>
        }
      />

      {!q && filter === "all" && active === "all" && <ConnectionMap groups={groups} />}
      {active === "all" && !q && <SetupProgress groups={groups} />}

      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-0 lg:flex-col lg:self-start phone-tabs">
          {[
            { key: "all", count: all.length },
            ...groups.map((g) => ({ key: g.key, count: g.items.length })),
          ].map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => {
                setActive(g.key);
                setQuery("");
              }}
              className={cn(
                "relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-[13px] font-semibold transition-colors",
                active === g.key && !q
                  ? "bg-accent text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {g.key === "all" ? t("hub.allSections") : t(`hub.group.${g.key}`)}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-subtle">{g.count}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-8">
          {/* A section picked on the left opens as its own map. */}
          {groupMap ? (
            <ConnectionMap groups={groups} group={groupMap} className="mb-0" />
          ) : shown.length ? (
            shown.map((g) => <CatalogGroupSection key={g.key} group={g} />)
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("hub.nothingFound")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
