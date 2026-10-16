import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/Logo";
import { NotificationBell, UserMenu } from "./AppSidebar";
import { NAV_ITEMS } from "@/lib/nav";
import { useMyOrganization } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/tones";

// The phone layout's chrome (html.phone, see PHONE_BOOT_SCRIPT): an app bar
// on top (page name, search, notifications, the person's menu) and a tab
// bar at the bottom with the main sections plus "Menyu" for the rest -- the
// way phone apps are laid out. Computers keep the sidebar; neither of these
// renders there (both are `hidden phone:flex`).

type NavItem = (typeof NAV_ITEMS)[number];

const isActive = (to: string, pathname: string) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

export function MobileTopBar({
  isAdmin,
  onOpenSearch,
  onEditProfile,
}: {
  isAdmin: boolean;
  onOpenSearch: () => void;
  onEditProfile: () => void;
}) {
  const { t } = useI18n();
  // The page's own header carries its name; the bar says whose workspace this is.
  const { data: org } = useMyOrganization();
  const title = org?.name || "SalesIQ";
  return (
    <header className="sticky top-0 z-30 hidden shrink-0 items-center gap-1 border-b border-border bg-background/95 pl-3 pr-2 pt-[env(safe-area-inset-top)] backdrop-blur phone:order-first phone:flex">
      <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5">
        <Link to="/" aria-label={t("nav./")} className="shrink-0">
          <Logo className="h-8 w-8" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-[17px] font-bold text-foreground">{title}</p>
      </div>
      <button
        type="button"
        aria-label={t("search.title")}
        onClick={onOpenSearch}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
      >
        <Search className="h-5 w-5" />
      </button>
      <NotificationBell mobile />
      <div className="shrink-0 pl-1">
        <UserMenu collapsed mobile isAdmin={isAdmin} onEditProfile={onEditProfile} />
      </div>
    </header>
  );
}

export function MobileTabBar({ items, onOpenMenu }: { items: NavItem[]; onOpenMenu: () => void }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The everyday sections; the rest (Sinfxona, AI, Settings, Admin) sit
  // behind "Menyu".
  const tabs = items.filter((i) => i.to !== "/settings" && i.to !== "/ai-assistant").slice(0, 4);
  const menuActive = !tabs.some((i) => isActive(i.to, pathname));
  const cell =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold leading-none transition-colors";
  return (
    <nav
      aria-label={t("shell.openMenu")}
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-border bg-background/95 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur phone:flex"
    >
      {tabs.map((item) => {
        const active = isActive(item.to, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(cell, active ? "text-foreground" : "text-muted-foreground")}
          >
            <span
              className={cn(
                "grid h-8 w-14 place-items-center rounded-full transition-colors",
                active && "bg-primary/12",
              )}
            >
              <item.icon
                className={cn("h-[22px] w-[22px]", active ? TONE_TEXT[item.tone] : "")}
                strokeWidth={active ? 2.3 : 2}
              />
            </span>
            <span className="w-full truncate text-center">{t(`nav.${item.to}`)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className={cn(cell, menuActive ? "text-foreground" : "text-muted-foreground")}
      >
        <span
          className={cn(
            "grid h-8 w-14 place-items-center rounded-full",
            menuActive && "bg-primary/12",
          )}
        >
          <Menu className="h-[22px] w-[22px]" />
        </span>
        <span>{t("shell.menu")}</span>
      </button>
    </nav>
  );
}
