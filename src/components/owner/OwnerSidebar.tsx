import type { CSSProperties } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/layout/AppSidebar";
import { useOwnerInbox, useSubscriptionRequestsRaw } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, railLabel, type NavItem } from "@/lib/nav";
import { OWNER_HUBS, OWNER_SETTINGS_HUB, ownerHubOf, type OwnerHub } from "@/lib/owner-hubs";
import { cn } from "@/lib/utils";
import { useBrowserZoom } from "@/lib/browser-zoom";
import { TONE_TILE } from "@/lib/tones";

// The platform owner's menu: a full 256px sidebar with every page named,
// in three groups (Biznes / Nazorat / Tizim, lib/owner-hubs.ts) -- no
// folded rail and no tab row on top of the pages. The chosen page is a solid
// brand row; waiting support chats and renewal requests show as a red
// count. One fixed size whatever the page zoom; the person's menu (theme,
// language, profile, sign out) at the bottom.

export function ownerNavItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.platformOwnerOnly);
}

/** Red counts per page: companies waiting for an answer, renewal requests. */
function useOwnerCounts(): Record<string, number> {
  const { data: inbox } = useOwnerInbox();
  const { data: requests } = useSubscriptionRequestsRaw();
  return {
    "/platform/support": inbox?.stats?.waiting ?? 0,
    "/platform/notifications": (requests ?? []).filter((r) => r.status === "pending").length,
  };
}

const hubLabel = (t: (k: string) => string, h: OwnerHub, rail: boolean) =>
  h.labelKey.startsWith("nav.") && rail ? railLabel(t, h.to) : t(h.labelKey);

function CountDot({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold tabular-nums leading-none text-white",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function OwnerSidebar({ onEditProfile }: { onEditProfile: () => void }) {
  const { t } = useI18n();
  // Like the CRM's rail: one fixed size whatever the page zoom.
  const zoom = useBrowserZoom();
  const frame: CSSProperties | undefined =
    zoom === 1 ? undefined : { zoom: 1 / zoom, height: `calc(100dvh * ${zoom})` };
  return (
    <div className="relative hidden h-dvh w-[256px] shrink-0 lg:block phone:hidden" style={frame}>
      <aside
        data-app-rail
        className="absolute inset-0 flex flex-col border-r border-sidebar-border bg-background"
      >
        <Link
          to="/platform/companies"
          className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5"
        >
          <Logo className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-tight text-foreground">
              {t("app.name")}
            </span>
            <span className="block text-[11.5px] font-medium text-muted-foreground">
              {t("owner.badge")}
            </span>
          </span>
        </Link>
        <OwnerNav
          grouped
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]"
        />
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <UserMenu collapsed={false} isAdmin={false} onEditProfile={onEditProfile} />
        </div>
      </aside>
    </div>
  );
}

/** The owner's sections with their pages: the phone's drawer. */
export function OwnerNav({
  className,
  onNavigate,
  grouped = false,
}: {
  className?: string | undefined;
  onNavigate?: (() => void) | undefined;
  /** Desktop: the menu's three groups instead of one heading per section. */
  grouped?: boolean;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const counts = useOwnerCounts();
  const at = ownerHubOf(pathname);
  const sections: { label: string; tabs: string[] }[] = grouped
    ? [
        { label: t("owner.group.business"), tabs: OWNER_HUBS[0]!.flatMap((h) => h.tabs) },
        { label: t("owner.group.control"), tabs: OWNER_HUBS[1]!.flatMap((h) => h.tabs) },
        { label: t("owner.group.system"), tabs: OWNER_SETTINGS_HUB.tabs },
      ]
    : [...OWNER_HUBS.flat(), OWNER_SETTINGS_HUB].map((h) => ({
        label: hubLabel(t, h, false),
        tabs: h.tabs,
      }));
  return (
    <nav className={cn("space-y-5", className)}>
      {sections.map((sec) => (
        <div key={sec.label}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-sidebar-muted">
            {sec.label}
          </p>
          <div className="space-y-1">
            {sec.tabs.map((tab) => {
              const item = NAV_ITEMS.find((i) => i.to === tab);
              if (!item) return null;
              const active = at?.tab === tab;
              return (
                <Link
                  key={tab}
                  to={tab}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-2.5 text-[14px] transition-colors",
                    active
                      ? "bg-primary font-semibold text-primary-foreground shadow-soft"
                      : "font-medium text-sidebar-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                      active ? "bg-white/18 text-primary-foreground" : TONE_TILE[item.tone],
                    )}
                  >
                    <item.icon className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t(`nav.${tab}`)}</span>
                  <CountDot n={counts[tab] ?? 0} className="h-5 min-w-5 text-[10.5px]" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
