import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/layout/AppSidebar";
import { usePlatformSupportThreads, useSubscriptionRequestsRaw } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

// The platform owner's menu: always open, 232px, the owner's pages in four
// groups (Biznes, Nazorat, Aloqa, Tizim) with one short name each -- no
// wrapped labels, no collapsing rail. Waiting support chats and renewal
// requests show as counts beside their items.

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = ownerNavItems();
  const { data: support } = usePlatformSupportThreads();
  const { data: requests } = useSubscriptionRequestsRaw();
  const counts: Record<string, number> = {
    "/platform/support": support?.stats.waiting ?? 0,
    "/platform/notifications": (requests ?? []).filter((r) => r.status === "pending").length,
  };

  return (
    <aside className="owner-sidebar hidden h-dvh w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex phone:hidden">
      <div className="flex h-16 items-center gap-2.5 px-4">
        <Link to="/platform/companies" aria-label={t("app.name")} className="shrink-0">
          <Logo className="h-8 w-8" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-foreground">
          {t("app.name")}
        </span>
        <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600 dark:text-amber-300">
          {t("owner.badge")}
        </span>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-3 pt-1">
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.ownerGroup === g);
          if (list.length === 0) return null;
          return (
            <div key={g}>
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-subtle">
                {t(`owner.group.${g}`)}
              </p>
              <div className="space-y-px">
                {list.map((item) => {
                  const active = isActive(item, pathname);
                  const count = counts[item.to] ?? 0;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-sidebar-active font-semibold text-foreground"
                          : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-[17px] w-[17px] shrink-0 transition-colors",
                          active
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                        strokeWidth={active ? 2.2 : 1.9}
                      />
                      <span className="min-w-0 flex-1 truncate">{t(`nav.${item.to}`)}</span>
                      {count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold tabular-nums text-white">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-2.5">
        <UserMenu collapsed={false} isAdmin={false} onEditProfile={onEditProfile} />
      </div>
    </aside>
  );
}
