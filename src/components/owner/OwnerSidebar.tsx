import type { CSSProperties } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { RAIL_ITEM, RAIL_LABEL, RAIL_STACK, UserMenu } from "@/components/layout/AppSidebar";
import { RailGlyph } from "@/components/layout/RailGlyph";
import { useOwnerInbox, useSubscriptionRequestsRaw } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, railLabel, type NavItem } from "@/lib/nav";
import { OWNER_HUBS, OWNER_SETTINGS_HUB, ownerHubOf, type OwnerHub } from "@/lib/owner-hubs";
import { cn } from "@/lib/utils";
import { useBrowserZoom } from "@/lib/browser-zoom";
import { TONE_TEXT, TONE_TILE } from "@/lib/tones";

// The platform owner's menu, the same rail as a company's CRM (AppSidebar):
// always folded, 72px, a few sections (lib/owner-hubs.ts) as coloured glyphs
// with a short name under them; the related pages of a section are tabs at
// the top of the page (OwnerHubTabs). Waiting support chats and renewal
// requests show as a red count. One fixed size whatever the page zoom; the
// person's menu (theme, language, profile, sign out) at the bottom.

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

const hubCount = (h: OwnerHub, counts: Record<string, number>) =>
  h.tabs.reduce((n, tab) => n + (counts[tab] ?? 0), 0);

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const counts = useOwnerCounts();
  const current = ownerHubOf(pathname)?.hub.id ?? null;

  // Like the CRM's rail: one fixed size whatever the page zoom.
  const zoom = useBrowserZoom();
  const frame: CSSProperties | undefined =
    zoom === 1 ? undefined : { zoom: 1 / zoom, height: `calc(100dvh * ${zoom})` };

  const railItem = (h: OwnerHub) => {
    const active = current === h.id;
    return (
      <Link
        key={h.id}
        to={h.to}
        title={t(h.labelKey)}
        className={cn(
          "group flex items-center transition-colors duration-150",
          RAIL_ITEM,
          active
            ? "bg-sidebar-active font-bold text-sidebar-active-foreground shadow-soft"
            : "font-semibold text-sidebar-foreground hover:bg-accent",
        )}
      >
        <span className="relative">
          <RailGlyph icon={h.icon} active={active} className={TONE_TEXT[h.tone]} />
          <CountDot
            n={hubCount(h, counts)}
            className="absolute -right-2.5 -top-1.5 ring-2 ring-background"
          />
        </span>
        <span className={RAIL_LABEL}>{hubLabel(t, h, true)}</span>
      </Link>
    );
  };

  return (
    <div className="relative hidden h-dvh w-[72px] shrink-0 lg:block phone:hidden" style={frame}>
      <aside
        data-app-rail
        className="absolute inset-0 flex flex-col border-r border-sidebar-border bg-background"
      >
        <div className="flex h-14 shrink-0 items-center justify-center">
          <Link to="/platform/companies" aria-label={t("app.name")} title={t("owner.badge")}>
            <Logo className="h-9 w-9" />
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 [scrollbar-width:none]">
          {OWNER_HUBS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="mx-2 my-2.5 border-t border-sidebar-border" />}
              <div className={RAIL_STACK}>{group.map(railItem)}</div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-sidebar-border p-1.5">
          <div className="mb-2">{railItem(OWNER_SETTINGS_HUB)}</div>
          <UserMenu collapsed isAdmin={false} onEditProfile={onEditProfile} />
        </div>
      </aside>
    </div>
  );
}

/** The owner's sections with their pages: the phone's drawer. */
export function OwnerNav({
  className,
  onNavigate,
}: {
  className?: string | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const counts = useOwnerCounts();
  const at = ownerHubOf(pathname);
  return (
    <nav className={cn("space-y-4", className)}>
      {[...OWNER_HUBS.flat(), OWNER_SETTINGS_HUB].map((h) => (
        <div key={h.id}>
          <p className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-sidebar-muted">
            {hubLabel(t, h, false)}
          </p>
          <div className="space-y-0.5">
            {h.tabs.map((tab) => {
              const nav = NAV_ITEMS.find((i) => i.to === tab);
              if (!nav) return null;
              const active = at?.tab === tab;
              return (
                <Link
                  key={tab}
                  to={tab}
                  onClick={onNavigate}
                  className={cn(
                    "flex h-10 items-center gap-2.5 rounded-xl px-2 text-[13.5px] font-medium transition-colors",
                    active
                      ? "bg-sidebar-active font-semibold text-sidebar-active-foreground shadow-soft"
                      : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                      TONE_TILE[nav.tone],
                    )}
                  >
                    <nav.icon className="h-[15px] w-[15px]" strokeWidth={2.1} />
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

/**
 * The tab row at the top of an owner page: the other pages of its section
 * (Nazorat: Tashriflar · Amallar · Xatolar). Nothing for a one-page section.
 */
export function OwnerHubTabs() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const counts = useOwnerCounts();
  const at = ownerHubOf(pathname);
  if (!at || at.hub.tabs.length < 2) return null;
  return (
    <div className="mb-4 flex justify-center phone:mb-3">
      <div className="phone-tabs ctl-track inline-flex h-11 items-center gap-1 rounded-xl p-1">
        {at.hub.tabs.map((tab) => {
          const nav = NAV_ITEMS.find((i) => i.to === tab);
          if (!nav) return null;
          return (
            <Link
              key={tab}
              to={tab}
              aria-selected={at.tab === tab}
              className="ctl-tab inline-flex h-full items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold"
            >
              <nav.icon className="h-4 w-4" />
              {t(`nav.${tab}`)}
              <CountDot n={counts[tab] ?? 0} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
