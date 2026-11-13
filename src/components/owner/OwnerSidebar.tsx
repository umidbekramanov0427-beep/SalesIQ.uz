import type { CSSProperties } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/layout/AppSidebar";
import { usePlatformSupportThreads, useSubscriptionRequestsRaw } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useBrowserZoom } from "@/lib/browser-zoom";
import { TONE_TILE } from "@/lib/tones";

// The platform owner's menu, in the admin console's look: always open,
// never folded, 192px, the owner's pages in four groups (Biznes, Nazorat, Aloqa, Tizim)
// under mono captions, each with its section's coloured icon tile; the open
// page is lit in signal blue with a glowing edge. Waiting support chats and
// renewal requests show as counts. One fixed size (it undoes the page
// zoom, like the CRM's rail) and compact rows, so it fits one screen;
// day/night lives in the person's menu.

const GROUPS = ["business", "control", "comms", "system"] as const;

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

export function OwnerSidebar({ onEditProfile }: { onEditProfile: () => void }) {
  const { t } = useI18n();

  // Like the CRM's rail: one fixed size whatever the page zoom, so the
  // whole menu always fits the screen the same way.
  const zoom = useBrowserZoom();
  const frame: CSSProperties | undefined =
    zoom === 1 ? undefined : { zoom: 1 / zoom, height: `calc(100dvh * ${zoom})` };

  return (
    <div className="relative hidden h-dvh w-[192px] shrink-0 lg:block phone:hidden" style={frame}>
      <aside className="owner-sidebar absolute inset-0 flex flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3.5">
          <Link to="/platform/companies" aria-label={t("app.name")} className="shrink-0">
            <Logo className="h-7 w-7" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              {t("app.name")}
            </p>
            <p className="console-caption mt-0.5 flex items-center gap-1.5 !text-[9.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
              {t("owner.badge")} panel
            </p>
          </div>
        </div>
        <OwnerNav
          compact
          className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:none]"
        />
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <UserMenu collapsed={false} isAdmin={false} onEditProfile={onEditProfile} />
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
  const { data: support } = usePlatformSupportThreads();
  const { data: requests } = useSubscriptionRequestsRaw();
  const counts: Record<string, number> = {
    "/platform/support": support?.stats.waiting ?? 0,
    "/platform/notifications": (requests ?? []).filter((r) => r.status === "pending").length,
  };
  return (
    <nav className={cn(compact ? "space-y-3.5" : "space-y-5", className)}>
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.ownerGroup === g);
        if (list.length === 0) return null;
        return (
          <div key={g}>
            <p
              className={cn(
                "console-caption px-2.5 !text-[10px]",
                compact ? "pb-1 !text-[9px] !leading-[14px]" : "pb-1.5",
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
                          ? "bg-primary/[0.09] font-semibold text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
                          : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary shadow-[0_0_10px_var(--console-glow,var(--primary))]"
                        />
                      )}
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
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 font-mono text-[10.5px] font-bold tabular-nums text-white shadow-[0_0_10px_-2px_rgb(244_63_94/0.7)]">
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
