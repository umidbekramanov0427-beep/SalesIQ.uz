import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Filter, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  AdminChrome,
  AdminConsoleHeader,
  SectionCard,
  SettingsLayout,
} from "@/components/layout/Primitives";
import {
  SetupInline,
  cardDescKey,
  cardIsLive,
  cardTitleKey,
  useAdminCatalog,
} from "@/components/admin/AdminCatalog";
import {
  AdminSectionCrumb,
  AdminSectionStrip,
  ConnectionMap,
  GROUP_ICON,
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

// The admin panel itself, as a console. At the top: SalesIQ in the middle
// and every section around it; a section opens as its own map (?group=),
// its pages around it. Searching or filtering shows the matching pages as
// a map too -- there is no card list under the map any more.
type Filter = "all" | "on" | "off";

function AdminHub() {
  const { t } = useI18n();
  const navigate = useNavigate();
  // ?group=<section>: the Admin panel opened on that section's map.
  const groupKey = useRouterState({
    select: (st) => String((st.location.search as Record<string, unknown>)["group"] ?? ""),
  });
  const groups = useAdminCatalog();
  const sidebar = useSidebarConfig();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pinned = sidebar.pinned;
  const openGroup = groups.find((g) => g.key === groupKey) ?? null;
  const scope = openGroup ? [openGroup] : groups;
  const all = scope.flatMap((g) => g.items);
  const stateful = all.filter((it) => it.status || it.pinPath);
  const onCount = stateful.filter((it) => cardIsLive(it, pinned)).length;
  const counts: Record<Filter, number> = {
    all: all.length,
    on: onCount,
    off: stateful.length - onCount,
  };
  // "Ulangan" / "Ulanmagan" only sort the pages that have a state.
  const matches = all.filter(
    (it) =>
      (filter === "all" ||
        ((it.status || it.pinPath) && (filter === "on") === cardIsLive(it, pinned))) &&
      (!q || `${t(cardTitleKey(it))} ${t(cardDescKey(it))}`.toLowerCase().includes(q)),
  );
  const picking = !!q || filter !== "all";
  const groupTitle = openGroup ? t(`hub.group.${openGroup.key}`) : null;
  return (
    <>
      {openGroup ? (
        <button
          type="button"
          onClick={() => void navigate({ to: "/admin", search: {} as never })}
          className="mb-5 inline-flex h-9 items-center gap-2 rounded-full ctl-soft px-4 text-[13px] font-semibold text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("console.backToAdmin")}
        </button>
      ) : (
        <BackButton className="mb-5" />
      )}
      <AdminConsoleHeader
        caption={openGroup ? `${t("console.crumb")} · ${groupTitle}` : t("console.crumb")}
        title={groupTitle ?? t("admin.title")}
        icon={openGroup ? GROUP_ICON[openGroup.key] : ShieldCheck}
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

      {picking ? (
        matches.length ? (
          <ConnectionMap
            groups={groups}
            items={matches}
            core={{
              title: q
                ? t("console.found", { count: matches.length })
                : t(`console.filter.${filter}`),
              icon: q ? Search : Filter,
            }}
          />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("hub.nothingFound")}</p>
        )
      ) : openGroup ? (
        <ConnectionMap groups={groups} group={openGroup} />
      ) : (
        <ConnectionMap
          groups={groups}
          mode="groups"
          headerRight={<SetupInline groups={groups} />}
        />
      )}
    </>
  );
}
