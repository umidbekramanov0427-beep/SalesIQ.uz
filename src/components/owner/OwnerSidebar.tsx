import type { CSSProperties } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { RAIL_ITEM, RAIL_LABEL, RAIL_STACK, UserMenu } from "@/components/layout/AppSidebar";
import { RailGlyph } from "@/components/layout/RailGlyph";
import { useOwnerInbox, useSubscriptionRequestsRaw } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, railLabel, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useBrowserZoom } from "@/lib/browser-zoom";
import { TONE_TEXT, TONE_TILE } from "@/lib/tones";

// The platform owner's menu, the same rail as a company's CRM (AppSidebar):
// always folded, 72px, each page as its coloured glyph with a short name
// under it, the four groups (Biznes, Nazorat, Aloqa, Tizim) parted by thin
// lines, waiting support chats and renewal requests as a red count on the
// glyph. One fixed size whatever the page zoom; the person's menu (theme,
// language, profile, sign out) at the bottom. The phone's drawer lists the
// same items with their full names (OwnerNav).

const GROUPS = ["business", "control", "comms", "system"] as const;
const SETTINGS = "/platform/settings";

export function ownerNavItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.platformOwnerOnly);
}

function isActive(item: NavItem, pathname: string) {
  if (item.to === "/platform/companies")
    return (
      pathname.startsWith("/platform/companies") ||
      pathname.startsWith("/platform/organizations") ||
      pathname.startsWith("/platform/usage")
    );
  if (item.to === "/platform/sessions")
    return pathname.startsWith("/platform/sessions") || pathname.startsWith("/platform/visit");
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

function useOwnerCounts(): Record<string, number> {
  const { data: inbox } = useOwnerInbox();
  const { data: requests } = useSubscriptionRequestsRaw();
  return {
    // Companies waiting for an answer (the inbox groups by company).
    "/platform/support": inbox?.stats?.waiting ?? 0,
    "/platform/notifications": (requests ?? []).filter((r) => r.status === "pending").length,
  };
}

export function OwnerSidebar({ onEditProfile }: { onEditProfile: () => void }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = ownerNavItems();
  const counts = useOwnerCounts();

  const railItem = (item: NavItem) => {
    const active = isActive(item, pathname);
    const count = counts[item.to] ?? 0;
    return (
      <Link
        key={item.to}
        to={item.to}
        title={t(`nav.${item.to}`)}
        className={cn(
          "group flex items-center transition-colors duration-150",
          RAIL_ITEM,
          active
            ? "bg-sidebar-active font-bold text-sidebar-active-foreground shadow-soft"
            : "font-semibold text-sidebar-foreground hover:bg-accent",
        )}
      >
        <span className="relative">
          <RailGlyph icon={item.icon} active={active} className={TONE_TEXT[item.tone]} />
          {count > 0 && (
            <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold tabular-nums leading-none text-white ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        <span className={RAIL_LABEL}>{railLabel(t, item.to)}</span>
      </Link>
    );
  };
  // Sozlamalar sits at the bottom, over the person's menu, as in the CRM.
  const settings = items.find((i) => i.to === SETTINGS) ?? null;

  // Like the CRM's rail: one fixed size whatever the page zoom, so the
  // whole menu always fits the screen the same way.
  const zoom = useBrowserZoom();
  const frame: CSSProperties | undefined =
    zoom === 1 ? undefined : { zoom: 1 / zoom, height: `calc(100dvh * ${zoom})` };

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
          {GROUPS.map((g, gi) => {
            const list = items.filter((i) => i.ownerGroup === g && i.to !== SETTINGS);
            if (list.length === 0) return null;
            return (
              <div key={g}>
                {gi > 0 && <div className="mx-2 my-2.5 border-t border-sidebar-border" />}
                <div className={RAIL_STACK}>{list.map(railItem)}</div>
              </div>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-sidebar-border p-1.5">
          {settings && <div className="mb-2">{railItem(settings)}</div>}
          <UserMenu collapsed isAdmin={false} onEditProfile={onEditProfile} />
        </div>
      </aside>
    </div>
  );
}

/** The owner's menu items in their groups: the sidebar and the phone's drawer. */
export function OwnerNav({
  className,
  onNavigate,
  compact = false,
}: {
  /** The desktop sidebar's tighter rows, so every item fits one screen. */
  compact?: boolean;
  className?: string | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = ownerNavItems();
  const counts = useOwnerCounts();
  return (
    <nav className={cn(compact ? "space-y-3.5" : "space-y-5", className)}>
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.ownerGroup === g);
        if (list.length === 0) return null;
        return (
          <div key={g}>
            <p
              className={cn(
                "px-2.5 text-[11px] font-bold uppercase tracking-wide text-sidebar-muted",
                compact ? "pb-1" : "pb-1.5",
              )}
            >
              {t(`owner.group.${g}`)}
            </p>
            <div className="space-y-0.5">
              {list.map((item) => {
                const active = isActive(item, pathname);
                const count = counts[item.to] ?? 0;
                return (
                  <div key={item.to} className="relative">
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-xl px-2 font-medium transition-colors",
                        compact ? "h-[34px] text-[13px]" : "h-10 text-[13.5px]",
                        active
                          ? "bg-sidebar-active font-semibold text-sidebar-active-foreground shadow-soft"
                          : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "grid shrink-0 place-items-center rounded-lg transition-colors",
                          compact ? "h-6 w-6 rounded-md" : "h-7 w-7",
                          TONE_TILE[item.tone],
                          !active && "opacity-85 group-hover:opacity-100",
                        )}
                      >
                        <item.icon
                          className={compact ? "h-[13px] w-[13px]" : "h-[15px] w-[15px]"}
                          strokeWidth={2.1}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t(`nav.${item.to}`)}</span>
                      {count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
