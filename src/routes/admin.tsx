import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader, SectionCard, SettingsLayout } from "@/components/layout/Primitives";
import {
  CatalogGroupSection,
  SetupProgress,
  cardDescKey,
  cardTitleKey,
  useAdminCatalog,
} from "@/components/admin/AdminCatalog";
import { cn } from "@/lib/utils";
import { SettingsFrame } from "@/components/admin/SettingsNav";
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
      <SettingsFrame>{pathname !== "/admin" ? <Outlet /> : <AdminHub />}</SettingsFrame>
    </SettingsLayout>
  );
}

// The admin panel itself: every setting as a card, grouped, one level deep
// -- with the sections on the left and a search, so every setting of the
// company (team and rights, CRM, bots, integrations, telephony, AI...) is
// found in one place.
function AdminHub() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const [active, setActive] = useState<string>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = groups
    .filter((g) => q || active === "all" || g.key === active)
    .map((g) =>
      q
        ? {
            ...g,
            items: g.items.filter((it) =>
              `${t(cardTitleKey(it))} ${t(cardDescKey(it))}`.toLowerCase().includes(q),
            ),
          }
        : g,
    )
    .filter((g) => g.items.length > 0);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        tone="primary"
        title={t("admin.title")}
        description={t("hub.desc")}
      />
      <SetupProgress groups={groups} />
      <div className="grid gap-6">
        {/* Desktop: the settings list on the left (SettingsFrame) takes this role. */}
        <nav className="flex gap-1 overflow-x-auto lg:hidden phone-tabs">
          <label className="relative mb-2 hidden lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("hub.search")}
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13.5px] outline-none placeholder:text-subtle focus:border-primary"
            />
          </label>
          {[
            { key: "all", count: total },
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
                "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-[13.5px] font-semibold transition-colors",
                active === g.key && !q
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {g.key === "all" ? t("hub.allSections") : t(`hub.group.${g.key}`)}
              </span>
              <span className="text-[12px] tabular-nums text-subtle">{g.count}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-8">
          {shown.length ? (
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
