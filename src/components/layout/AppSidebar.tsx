import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  ChevronsLeft,
  Command,
  LogOut,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { LANGS, LANG_FLAGS, LANG_SHORT, useI18n, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import {
  useFunnelNames,
  useMarkNotificationRead,
  useMyOrganization,
  useNotificationsView,
} from "@/hooks/use-crm-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  isPlatformOwner: boolean;
};

function NotificationBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { rows: notifications } = useNotificationsView();
  const markRead = useMarkNotificationRead();
  const unreadCount = notifications.filter((n) => n.unread).length;
  const recent = notifications.slice(0, 6);

  function open(n: (typeof notifications)[number]) {
    if (n.unread) markRead.mutate(n.id);
    if (n.link) void navigate({ to: n.link });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("shell.notifications")}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive shadow-soft transition-colors hover:bg-destructive/15"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" sideOffset={8} className="w-80 space-y-1 p-2">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
          {t("shell.notifications")}
        </p>
        {recent.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-subtle">{t("inbox.empty")}</p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {recent.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "block w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent",
                  n.unread && "bg-destructive/5",
                )}
              >
                <span className="flex items-center gap-2">
                  {n.unread && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                  )}
                  <span className="truncate text-sm font-semibold text-foreground">{n.title}</span>
                </span>
                {n.body && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {n.body}
                  </span>
                )}
                <span className="mt-0.5 flex items-center justify-between">
                  <span className="text-[11px] text-subtle">{n.meta}</span>
                  {n.link && (
                    <span className="text-[11px] font-semibold text-primary">
                      {t("inbox.open")}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        <Link
          to="/inbox"
          className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-accent"
        >
          {t("inbox.viewAll")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ collapsed, isAdmin }: { collapsed: boolean; isAdmin: boolean }) {
  const { t, lang, setLang } = useI18n();
  const { dark, setDark } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function onSignOut() {
    await signOut();
    void navigate({ to: "/login", replace: true });
  }

  const { data: org } = useMyOrganization();

  const trigger = collapsed ? (
    <button className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-xs font-semibold text-primary transition-colors hover:bg-primary/25">
      {user?.initials ?? "?"}
    </button>
  ) : (
    <button className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-group px-3 py-3 text-left shadow-soft transition-colors hover:bg-accent">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
        {user?.initials ?? "?"}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">
          {user?.name ?? "…"}
        </span>
        <span className="block truncate text-[11px] text-sidebar-muted">
          {org?.name || user?.email || ""}
        </span>
      </span>
      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-72 space-y-3 p-4">
        <div className="rounded-xl bg-surface p-3">
          <span className="text-[13px] font-semibold text-muted-foreground">
            {t("userMenu.language")}
          </span>
          <div className="mt-2">
            <SegmentedControl<Lang>
              value={lang}
              options={LANGS}
              render={(l) => `${LANG_FLAGS[l]} ${LANG_SHORT[l]}`}
              onChange={setLang}
              size="sm"
            />
          </div>
        </div>
        <div className="rounded-xl bg-surface p-3">
          <span className="text-[13px] font-semibold text-muted-foreground">
            {t("userMenu.theme")}
          </span>
          <div className="mt-2">
            <SegmentedControl<"light" | "dark">
              value={dark ? "dark" : "light"}
              options={["light", "dark"]}
              render={(v) => (v === "light" ? t("userMenu.light") : t("userMenu.dark"))}
              onChange={(v) => setDark(v === "dark")}
              size="sm"
            />
          </div>
        </div>
        <div className="space-y-0.5">
          <Link
            to="/settings"
            search={{ section: "profile" }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <UserCircle className="h-4 w-4" /> {t("userMenu.account")}
          </Link>
          {isAdmin && (
            <>
              <Link
                to="/admin"
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Users className="h-4 w-4" /> {t("userMenu.users")}
              </Link>
              <Link
                to="/admin"
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <ShieldCheck className="h-4 w-4" /> {t("nav./admin")}
              </Link>
            </>
          )}
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" /> {t("userMenu.logout")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function FunnelsNavGroup({
  item,
  collapsed,
  active,
}: {
  item: (typeof NAV_ITEMS)[number];
  collapsed: boolean;
  active: boolean;
}) {
  const { t } = useI18n();
  const { names } = useFunnelNames();
  const [expanded, setExpanded] = useState(() => active);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const activeFunnel = typeof search["funnel"] === "string" ? search["funnel"] : undefined;

  if (collapsed) {
    return (
      <Link
        to={item.to}
        className={cn(
          "group flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2.5 text-center transition-colors duration-150",
          active
            ? "bg-sidebar-active text-sidebar-active-foreground"
            : "text-sidebar-foreground hover:bg-accent",
        )}
      >
        <item.icon
          strokeWidth={active ? 2.5 : 2}
          className={cn(
            "h-6 w-6 shrink-0",
            active ? "text-sidebar-active-foreground" : "text-sidebar-muted",
          )}
        />
        <span
          className={cn(
            "w-full whitespace-normal break-words text-[11px] leading-tight",
            active ? "font-bold" : "font-semibold",
          )}
        >
          {t(`nav.${item.to}`)}
        </span>
      </Link>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "group flex w-full items-center gap-1 rounded-lg border-l-2 text-base font-bold transition-colors duration-150",
          active
            ? "border-mint bg-sidebar-active text-sidebar-active-foreground shadow-soft"
            : "border-transparent text-sidebar-foreground",
        )}
      >
        <Link
          to={item.to}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-lg py-2 pl-[10px]",
            !active && "hover:bg-accent",
          )}
        >
          <item.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              active ? "text-sidebar-active-foreground" : "text-sidebar-muted",
            )}
          />
          <span className="truncate">{t(`nav.${item.to}`)}</span>
        </Link>
        {names.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mr-1.5 rounded-lg p-1 text-current/70 hover:bg-black/5"
            aria-label={expanded ? t("nav.collapse") : t("nav.groupAnalytics")}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {expanded && names.length > 0 && (
        <div className="ml-[22px] mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
          {names.map((name) => {
            const isActiveFunnel = active && activeFunnel === name;
            return (
              <Link
                key={name}
                to="/funnels"
                search={{ funnel: name }}
                className={cn(
                  "block truncate rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                  isActiveFunnel
                    ? "bg-mint font-semibold text-mint-foreground"
                    : "text-sidebar-muted hover:bg-accent hover:text-sidebar-foreground",
                )}
              >
                {name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ collapsed, onToggle, isAdmin, isPlatformOwner }: Props) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mainItems = NAV_ITEMS.filter(
    (i) =>
      (!i.adminOnly || isAdmin) &&
      !i.platformOwnerOnly &&
      i.to !== "/settings" &&
      i.to !== "/admin" &&
      i.to !== "/ai-assistant",
  );
  // Platform-owner-only items (Platform, Users, Errors, etc.) carry no
  // `group`, so they render together, unlabeled, above the three named
  // groups — same spot they've always occupied.
  const ungroupedItems = mainItems.filter((i) => !i.group);
  const generalItems = mainItems.filter((i) => i.group === "general");
  const analysisItems = mainItems.filter((i) => i.group === "analysis");
  const controlItems = mainItems.filter((i) => i.group === "control");
  const settingsItem = NAV_ITEMS.find((i) => i.to === "/settings")!;
  const aiAssistantItem = NAV_ITEMS.find((i) => i.to === "/ai-assistant")!;

  function renderItem(item: (typeof NAV_ITEMS)[number]) {
    const badge = item.badge;
    // "/platform" has sibling sub-pages (/platform/users etc.) that share
    // its prefix, so it needs the same exact-match treatment as "/" —
    // otherwise both "Platform" and e.g. "Users" would show active at once.
    const active =
      item.to === "/"
        ? pathname === "/"
        : item.to === "/platform"
          ? pathname === "/platform" || pathname.startsWith("/platform/organizations")
          : pathname.startsWith(item.to);
    const isSettings = item.to === "/settings";
    const isActivityLog = item.to === "/platform/activity";
    // Admin-level, high-stakes screens (who can do what, and where the
    // org's outside systems are wired in) get a permanent gold accent
    // instead of the plain sidebar look, so they read as "handle with
    // care" at a glance rather than blending into routine nav items.
    const isCritical = item.to === "/admin" || item.to === "/platform/integrations";
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "group flex items-center transition-colors duration-150",
          isCritical
            ? "border border-amber-400/40 bg-amber-400/15 text-amber-700 hover:bg-amber-400/25 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
            : active
              ? "bg-sidebar-active text-sidebar-active-foreground shadow-soft"
              : "text-sidebar-foreground",
          !active && !isCritical && isSettings && "hover:bg-primary/15 hover:text-primary",
          !active &&
            !isCritical &&
            isActivityLog &&
            "hover:bg-destructive/15 hover:text-destructive",
          !active && !isCritical && !isSettings && !isActivityLog && "hover:bg-accent",
          collapsed
            ? cn(
                "w-full flex-col justify-center gap-1 rounded-lg px-1.5 py-2.5 text-center text-[11px] leading-tight",
                active ? "font-bold" : "font-semibold",
              )
            : cn(
                "w-full gap-3 rounded-lg border-l-2 py-2 pl-[10px] pr-3 text-base font-bold",
                isCritical ? "border-transparent" : active ? "border-mint" : "border-transparent",
              ),
        )}
      >
        <item.icon
          strokeWidth={active ? 2.5 : 2}
          className={cn(
            collapsed ? "h-6 w-6" : "h-[18px] w-[18px]",
            "shrink-0 transition-colors",
            isCritical
              ? "text-amber-600 dark:text-amber-400"
              : active
                ? "text-sidebar-active-foreground"
                : "text-sidebar-muted",
          )}
        />
        {collapsed ? (
          <span className="w-full whitespace-normal break-words">{t(`nav.${item.to}`)}</span>
        ) : (
          <>
            <span className="truncate">{t(`nav.${item.to}`)}</span>
            {badge && badge !== "0" && (
              <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  }

  function renderGroup(labelKey: string, items: (typeof NAV_ITEMS)[number][]) {
    if (items.length === 0) return null;
    return (
      <>
        {!collapsed && (
          <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-sidebar-muted">
            {t(labelKey)}
          </p>
        )}
        {collapsed && <div className="my-3 border-t border-sidebar-border" />}
        <div
          className={cn(
            "space-y-0.5",
            !collapsed && "rounded-2xl bg-sidebar-group p-1.5 dark:bg-transparent dark:p-0",
          )}
        >
          {items.map((item) =>
            item.to === "/funnels" ? (
              <FunnelsNavGroup
                key={item.to}
                item={item}
                collapsed={collapsed}
                active={pathname.startsWith(item.to)}
              />
            ) : (
              renderItem(item)
            ),
          )}
        </div>
      </>
    );
  }

  // A platform owner's job is running the platform, not one company's
  // day-to-day CRM -- even one they also happen to belong to (this
  // session's own setup) -- so they always get this short, dedicated
  // sidebar instead of the regular one, regardless of organizationId.
  if (isPlatformOwner) {
    const platformItems = NAV_ITEMS.filter((i) => i.platformOwnerOnly);
    return (
      <aside
        className={cn(
          // bg-background (not bg-sidebar) -- the icon rail sits one shade
          // darker than the settings sub-nav it lives beside, matching the
          // reference's 3-tone hierarchy (rail darkest, page canvas
          // in-between, nav lightest); bg-sidebar here made the rail and
          // the settings nav render as the exact same color.
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-background transition-[width] duration-300 ease-out lg:flex",
          collapsed ? "w-[132px]" : "w-[264px]",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 px-4">
          <Logo className="h-9 w-9 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-foreground">{t("app.name")}</p>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">{platformItems.map(renderItem)}</nav>
        <div className="border-t border-sidebar-border p-3">
          <UserMenu collapsed={collapsed} isAdmin={false} />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        // See the platform-owner rail above for why this is bg-background,
        // not bg-sidebar.
        "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-background transition-[width] duration-300 ease-out lg:flex",
        collapsed ? "w-[132px]" : "w-[264px]",
      )}
    >
      <div
        className={cn("flex h-16 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}
      >
        <Logo className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-foreground">{t("app.name")}</p>
            </div>
            <NotificationBell />
          </>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {ungroupedItems.map((item) => renderItem(item))}
        {renderGroup("nav.groupGeneral", generalItems)}
        {renderGroup("nav.groupAnalytics", analysisItems)}
        {renderGroup("nav.groupControl", controlItems)}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div>{renderItem(aiAssistantItem)}</div>

        <div className="mt-2">{renderItem(settingsItem)}</div>

        <div className="mt-2">
          <UserMenu collapsed={collapsed} isAdmin={isAdmin} />
        </div>

        <button
          onClick={onToggle}
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronsLeft
            className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")}
          />
          {!collapsed && <span>{t("nav.collapse")}</span>}
          {!collapsed && (
            <span className="ml-auto flex items-center gap-0.5 text-[11px] text-subtle">
              <Command className="h-3 w-3" />B
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
