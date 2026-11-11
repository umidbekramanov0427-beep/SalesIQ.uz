import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { canOpenSection } from "@/lib/access-rules";
import { useAccessRules, useOrgGeneralSettings } from "@/hooks/use-crm-data";
import { useEffect, useState, type ReactElement } from "react";
import {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  ChevronsLeft,
  Command,
  Headset,
  Laptop,
  Lock,
  LogOut,
  Moon,
  GraduationCap,
  Search,
  Sun,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { NAV_ITEMS, appRoleOf, moduleItemsFor, navItemsFor } from "@/lib/nav";
import { RailGlyph } from "@/components/layout/RailGlyph";
import {
  OPEN_NOTIFICATIONS_EVENT,
  RailNotifications,
} from "@/components/notifications/NotificationDrawer";
import { resolveSidebar } from "@/lib/sidebar-config";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/tones";
import { Logo } from "@/components/Logo";
import { OPEN_SUPPORT_EVENT } from "@/components/ai/AiAssistantFab";
import { LANGS, LANG_FLAGS, LANG_SHORT, useI18n, type Lang } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { InboxPanel } from "@/components/inbox/InboxPanel";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled, useOrgAccess } from "@/lib/use-org-access";
import {
  useCrmFunnelNames,
  useMarkNotificationRead,
  useSidebarConfig,
  useMyOrganization,
  useNotificationsView,
} from "@/hooks/use-crm-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  collapsed: boolean;
  // The search button under the logo (and ⌘K) opens the search window;
  // the pencil in the avatar menu opens the profile window.
  onOpenSearch?: () => void;
  onEditProfile?: () => void;
  // Funnels and the lead card: a slim icon-only rail, so the board and the
  // lead get the screen.
  compact?: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  isPlatformOwner: boolean;
};

// On the slim rail an icon's name shows beside it on hover.
function RailTip({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: ReactElement;
}) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={12}
        className="rounded-xl border border-border bg-popover px-3 py-2 text-[13px] font-semibold text-popover-foreground shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// The slim rail shows each icon with its name under it, as amoCRM's left
// bar does: a clear 26px outline icon and a small two-line label.
// Airier on tall screens, back to tight on short laptops so every item fits.
const RAIL_ITEM = "w-full flex-col justify-center gap-1 rounded-lg px-1 py-1.5 text-center";
// One fixed size: the rail does not tighten or loosen with the window's
// height -- when it doesn't fit, its list scrolls instead.
const RAIL_STACK = "space-y-1.5";
const RAIL_LABEL = "line-clamp-2 w-full break-words text-[9.5px] leading-[12px]";
// The rail's two key tiles -- search at the top, the person at the bottom --
// share one look: a soft gradient card holding just the glyph.
const RAIL_TILE =
  "group mx-auto flex h-[44px] w-[50px] flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-primary/15 via-sky-500/10 to-violet-500/20 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_28%,transparent)] transition-all hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_55%,transparent),0_6px_16px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]";
export function NotificationBell({
  rail = false,
  mobile = false,
}: {
  rail?: boolean;
  mobile?: boolean;
}) {
  const { t } = useI18n();
  const { rows: notifications } = useNotificationsView();
  const unreadCount = notifications.filter((n) => n.unread).length;
  // The bell opens the whole notification center in the middle of the
  // screen; going to a notification's page closes it.
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.href });
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("shell.notifications")}
        title={rail ? t("shell.notifications") : undefined}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl transition-colors",
          mobile
            ? cn(
                "h-10 w-10 hover:bg-accent",
                unreadCount > 0 ? "text-destructive" : "text-muted-foreground",
              )
            : rail
              ? cn(RAIL_ITEM, "flex text-sidebar-foreground hover:bg-accent")
              : "h-11 w-11 border border-destructive/20 bg-destructive/10 text-destructive shadow-soft hover:bg-destructive/15",
        )}
      >
        {rail ? (
          <>
            <span className="relative">
              <RailGlyph icon={Bell} className="text-amber-600 dark:text-amber-400" />
              {/* Unread: a small red dot, not a count. */}
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </span>
            <span className={cn(RAIL_LABEL, "font-semibold")}>{t("shell.notificationsShort")}</span>
          </>
        ) : (
          <>
            <Bell strokeWidth={2} className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
            )}
          </>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] w-[min(1100px,calc(100vw-32px))] max-w-none overflow-y-auto p-6 phone:p-4">
          <DialogTitle className="sr-only">{t("shell.notifications")}</DialogTitle>
          <InboxPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Sinfxona on the rail: the same gradient tile as Search, right under
// Nazorat, with its name under it like the other items.
function ClassroomTile({ label, active }: { label: string; active: boolean }) {
  return (
    <RailTip label={label} show={false}>
      <Link
        to="/content-library"
        aria-label={label}
        className="group mx-auto flex w-full flex-col items-center gap-1 py-1 text-sidebar-foreground"
      >
        <span
          className={cn(
            RAIL_TILE,
            active &&
              "shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--primary)_70%,transparent)]",
          )}
        >
          <RailGlyph icon={GraduationCap} className="transition-transform group-hover:scale-110" />
        </span>
        <span className={cn(RAIL_LABEL, "text-center", active ? "font-bold" : "font-semibold")}>
          {label}
        </span>
      </Link>
    </RailTip>
  );
}

// Search sits right under the logo: a magnifier on the slim rail, a
// search-field look on the full menu. Both open the search window (⌘K).
function SearchButton({
  collapsed,
  onOpen,
}: {
  collapsed: boolean;
  onOpen?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  if (collapsed) {
    return (
      <RailTip label={`${t("search.title")} · ⌘K`} show>
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("search.title")}
          className={cn(RAIL_TILE, "mb-2")}
        >
          <RailGlyph icon={Search} className="transition-transform group-hover:scale-110" />
        </button>
      </RailTip>
    );
  }
  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-group px-3 text-left text-sm text-sidebar-muted transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{t("search.title")}</span>
        <kbd className="rounded-md border border-border bg-background px-1.5 text-[10px] font-semibold">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}

const ROLE_KEY: Record<string, string> = {
  super_admin: "admin.roleAdmin",
  platform_owner: "admin.roleAdmin",
  rop: "admin.roleRop",
  sotuv_menejeri: "admin.roleRep",
};

// Everything about the signed-in person lives behind their avatar: who they
// are, editing the profile, the theme, the language, the admin panel and
// signing out -- the place people look for it in every other app.
export function UserMenu({
  collapsed,
  isAdmin,
  onEditProfile,
  mobile = false,
}: {
  collapsed: boolean;
  isAdmin: boolean;
  onEditProfile?: (() => void) | undefined;
  mobile?: boolean;
}) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function onSignOut() {
    setOpen(false);
    await signOut();
    void navigate({ to: "/login", replace: true });
  }

  const { data: org } = useMyOrganization();
  const { rows: notifications } = useNotificationsView();
  const unread = notifications.filter((n) => n.unread).length;
  const roleLabel = user?.role ? t(ROLE_KEY[user.role] ?? "") : "";

  const trigger = collapsed ? (
    <button
      aria-label={t("userMenu.open")}
      title={user?.name ?? undefined}
      className={cn(
        RAIL_TILE,
        "data-[state=open]:shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--primary)_70%,transparent)]",
      )}
    >
      <span className="text-[15px] font-extrabold leading-none tracking-wide transition-transform group-hover:scale-110">
        {user?.initials ?? "?"}
      </span>
    </button>
  ) : (
    <button className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-group px-3 py-3 text-left shadow-soft transition-colors hover:bg-accent">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
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

  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={mobile ? "bottom" : collapsed ? "right" : "top"}
        align="end"
        sideOffset={mobile ? 8 : 12}
        collisionPadding={8}
        className="w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl p-0"
      >
        {/* Who's signed in */}
        <div className="flex items-center gap-3 border-b border-border p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            {user?.initials ?? "?"}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-bold text-foreground">{user?.name ?? "…"}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {[roleLabel, org?.name].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div>
            <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
              {t("userMenu.theme")}
            </p>
            <SegmentedControl<ThemeMode>
              value={mode}
              options={["system", "light", "dark"]}
              render={(v) => (
                <span className="inline-flex items-center gap-1.5">
                  {v === "system" ? (
                    <Laptop className="h-3.5 w-3.5" />
                  ) : v === "light" ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                  {v === "system"
                    ? t("accountBar.themeAuto")
                    : v === "light"
                      ? t("accountBar.themeLight")
                      : t("accountBar.themeDark")}
                </span>
              )}
              onChange={setMode}
              size="sm"
              stretch
            />
          </div>
          <div>
            <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
              {t("userMenu.language")}
            </p>
            <SegmentedControl<Lang>
              value={lang}
              options={LANGS}
              render={(l) => `${LANG_FLAGS[l]} ${LANG_SHORT[l]}`}
              onChange={setLang}
              size="sm"
              stretch
            />
          </div>
        </div>

        <div className="space-y-0.5 border-t border-border p-2">
          {/* The notifications drawer (on phones the app bar has its own bell). */}
          {!mobile && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_EVENT));
              }}
              className={cn(item, "w-full text-left")}
            >
              <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              {t("userMenu.messages")}
              {unread > 0 && (
                <span className="ml-auto min-w-[20px] rounded-full bg-destructive px-1.5 text-center text-[11px] font-bold leading-5 text-destructive-foreground tabular-nums">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          )}
          {/* Name, phone, email, password and devices: the profile window. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEditProfile?.();
            }}
            className={cn(item, "w-full text-left")}
          >
            <UserCircle className="h-4 w-4 text-muted-foreground" /> {t("userMenu.account")}
          </button>
          {/* Live support: the assistant's Operator tab (AiAssistantFab). */}
          {user?.role !== "platform_owner" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT));
              }}
              className={cn(item, "w-full text-left")}
            >
              <Headset className="h-4 w-4 text-muted-foreground" /> {t("support.menuItem")}
            </button>
          )}
          {isAdmin && (
            <>
              <Link to="/admin/employees" onClick={() => setOpen(false)} className={item}>
                <Users className="h-4 w-4 text-muted-foreground" /> {t("userMenu.users")}
              </Link>
              {/* Gold, like every "handle with care" admin entry. */}
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="mt-1 flex w-full items-center gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/15 px-2.5 py-2 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-400/25 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
              >
                <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />{" "}
                {t("nav./admin")}
              </Link>
            </>
          )}
        </div>
        <div className="border-t border-border p-2">
          <button
            onClick={() => void onSignOut()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> {t("userMenu.logout")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FunnelsNavGroup({
  item,
  collapsed,
  compact,
  active,
}: {
  item: (typeof NAV_ITEMS)[number];
  collapsed: boolean;
  compact: boolean;
  active: boolean;
}) {
  const { t } = useI18n();
  const { names } = useCrmFunnelNames();
  const [expanded, setExpanded] = useState(() => active);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const activeFunnel = typeof search["funnel"] === "string" ? search["funnel"] : undefined;

  if (collapsed) {
    return (
      <RailTip label={t(`nav.${item.to}`)} show={false}>
        <Link
          to={item.to}
          className={cn(
            "group flex items-center transition-colors duration-150",
            RAIL_ITEM,
            active
              ? "bg-sidebar-active text-sidebar-active-foreground"
              : "text-sidebar-foreground hover:bg-accent",
          )}
        >
          <RailGlyph icon={item.icon} active={active} className={TONE_TEXT[item.tone]} />
          <span className={cn(RAIL_LABEL, active ? "font-bold" : "font-semibold")}>
            {t(`nav.${item.to}`)}
          </span>
        </Link>
      </RailTip>
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
          <item.icon className={cn("h-[18px] w-[18px] shrink-0", TONE_TEXT[item.tone])} />
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

export function AppSidebar({
  collapsed: collapsedProp,
  onOpenSearch,
  onEditProfile,
  compact = false,
  onToggle,
  isAdmin,
  isPlatformOwner,
}: Props) {
  const collapsed = collapsedProp || compact;
  const { t } = useI18n();
  const { user } = useAuth();
  const orgAccess = useOrgAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crmEnabled = useCrmEnabled();
  // The company's own sidebar: standard sections it kept, modules it
  // pinned, in its order (Admin panel → Yon menyu).
  const sidebarConfig = useSidebarConfig();
  const role = appRoleOf(user);
  const { rules: accessRules } = useAccessRules();
  // Sozlamalar → Umumiy: the company's own logo at the top, as in amoCRM.
  const { data: orgGeneral } = useOrgGeneralSettings();
  const companyLogo = orgGeneral?.company_logo_url ?? null;
  const resolved = resolveSidebar(
    [...navItemsFor(role, crmEnabled), ...moduleItemsFor(role, crmEnabled)],
    sidebarConfig,
  ).filter((i) => canOpenSection(accessRules, role, i.to));
  // AI yordamchi is not in the menu: its floating button opens it.
  // Sinfxona sits right under Nazorat, as a tile like Search.
  const classroomItem = resolved.find((i) => i.to === "/content-library") ?? null;
  const mainItems = resolved.filter(
    (i) =>
      (!i.adminOnly || isAdmin) &&
      i.to !== "/settings" &&
      i.to !== "/admin" &&
      i.to !== "/ai-assistant" &&
      i.to !== "/content-library",
  );
  // Platform-owner-only items (Platform, Users, Errors, etc.) carry no
  // `group`, so they render together, unlabeled, above the three named
  // groups — same spot they've always occupied.
  const ungroupedItems = mainItems.filter((i) => !i.group);
  const generalItems = mainItems.filter((i) => i.group === "general");
  const analysisItems = mainItems.filter((i) => i.group === "analysis");
  const controlItems = [
    ...mainItems.filter((i) => i.group === "control"),
    ...(classroomItem ? [classroomItem] : []),
  ];
  const settingsItem = NAV_ITEMS.find((i) => i.to === "/settings")!;

  function renderItem(item: (typeof NAV_ITEMS)[number]) {
    const badge = item.badge;
    const locked = !!item.minFeature && !orgAccess.has(item.minFeature);
    // A company's own pages (/platform/organizations/…, /platform/usage/…)
    // belong to Kompaniyalar; a visit's timeline to Tashriflar.
    const active =
      item.to === "/"
        ? pathname === "/"
        : item.to === "/platform/companies"
          ? pathname.startsWith("/platform/companies") ||
            pathname.startsWith("/platform/organizations") ||
            pathname.startsWith("/platform/usage")
          : item.to === "/platform/sessions"
            ? pathname.startsWith("/platform/sessions") || pathname.startsWith("/platform/visit")
            : pathname.startsWith(item.to);
    const isSettings = item.to === "/settings";
    // Admin-level, high-stakes screens (who can do what, and where the
    // org's outside systems are wired in) get a permanent gold accent
    // instead of the plain sidebar look, so they read as "handle with
    // care" at a glance rather than blending into routine nav items.
    const isCritical = item.to === "/admin" || item.to === "/platform/integrations";
    return (
      <RailTip key={item.to} label={t(`nav.${item.to}`)} show={false}>
        <Link
          to={item.to}
          className={cn(
            "group flex items-center transition-colors duration-150",
            isCritical
              ? "border border-amber-400/40 bg-amber-400/15 text-amber-700 hover:bg-amber-400/25 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
              : active
                ? "bg-sidebar-active text-sidebar-active-foreground shadow-soft"
                : "text-sidebar-foreground",
            !active && !isCritical && isSettings && "hover:bg-primary/15 hover:text-primary",
            !active && !isCritical && !isSettings && "hover:bg-accent",
            collapsed
              ? cn(RAIL_ITEM, active ? "font-bold" : "font-semibold")
              : cn(
                  "w-full gap-3 rounded-lg border-l-2 py-2 pl-[10px] pr-3 text-base font-bold",
                  isCritical ? "border-transparent" : active ? "border-mint" : "border-transparent",
                ),
          )}
        >
          {collapsed ? (
            <RailGlyph
              icon={item.icon}
              active={active}
              className={isCritical ? "text-amber-600 dark:text-amber-400" : TONE_TEXT[item.tone]}
            />
          ) : (
            <item.icon
              strokeWidth={active ? 2.5 : 2}
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                isCritical ? "text-amber-600 dark:text-amber-400" : TONE_TEXT[item.tone],
              )}
            />
          )}
          {collapsed ? (
            <span className={cn("relative", RAIL_LABEL)}>
              {t(`nav.${item.to}`)}
              {locked && (
                <Lock className="absolute -right-0.5 -top-0.5 h-3 w-3 shrink-0 text-sidebar-muted" />
              )}
            </span>
          ) : (
            <>
              <span className="truncate">{t(`nav.${item.to}`)}</span>
              {locked && <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-muted" />}
              {!locked && badge && badge !== "0" && (
                <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {badge}
                </span>
              )}
            </>
          )}
        </Link>
      </RailTip>
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
        {collapsed && (
          <div className={cn("border-t border-sidebar-border", compact ? "mx-2 my-2.5" : "my-3")} />
        )}
        <div
          className={cn(
            collapsed ? RAIL_STACK : "space-y-0.5",
            !collapsed && "rounded-2xl bg-sidebar-group p-1.5 dark:bg-transparent dark:p-0",
          )}
        >
          {items.map((item) =>
            item.to === "/content-library" && collapsed ? (
              <ClassroomTile
                key={item.to}
                label={t(`nav.${item.to}`)}
                active={pathname.startsWith(item.to)}
              />
            ) : item.to === "/funnels" ? (
              <FunnelsNavGroup
                key={item.to}
                item={item}
                collapsed={collapsed}
                compact={compact}
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
      <TooltipProvider delayDuration={80}>
        {/* The page always keeps the narrow rail's width; the opened menu
          lies over the page from it instead of pushing the page aside. */}
        <div className="relative hidden h-dvh w-[80px] shrink-0 lg:block phone:hidden">
          <aside
            className={cn(
              // bg-background (not bg-sidebar) -- the icon rail sits one shade
              // darker than the settings sub-nav it lives beside, matching the
              // reference's 3-tone hierarchy (rail darkest, page canvas
              // in-between, nav lightest); bg-sidebar here made the rail and
              // the settings nav render as the exact same color.
              // h-dvh (not h-screen), matching AppShell's own root -- h-screen
              // and h-dvh can resolve to slightly different px heights at some
              // browser zoom levels, and that few-px drift was exactly what let
              // this aside run a hair taller than the real visible viewport,
              // pushing its bottom nav items (Sozlamalar, AI yordamchi, the
              // user menu) below the fold with no way to reach them.
              "absolute left-0 top-0 z-40 flex h-dvh flex-col border-r border-sidebar-border bg-background transition-[width,box-shadow] duration-300 ease-out",
              compact ? "w-[80px]" : collapsed ? "w-[132px]" : "w-[264px] shadow-2xl",
            )}
          >
            <div className="flex h-16 items-center gap-2.5 px-4">
              <Link
                to="/platform/companies"
                aria-label={t("app.name")}
                className="shrink-0 rounded-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Logo className="h-9 w-9" />
              </Link>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-foreground">{t("app.name")}</p>
                </div>
              )}
            </div>
            <nav className="flex-1 space-y-0.5 px-3 py-2">{platformItems.map(renderItem)}</nav>
            <div className="border-t border-sidebar-border p-3">
              <UserMenu collapsed={collapsed} isAdmin={false} onEditProfile={onEditProfile} />
            </div>
          </aside>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={80}>
      <div className="relative hidden h-dvh w-[80px] shrink-0 lg:block phone:hidden">
        <aside
          className={cn(
            // See the platform-owner rail above for why this is bg-background,
            // not bg-sidebar.
            "absolute left-0 top-0 z-40 flex h-dvh flex-col border-r border-sidebar-border bg-background transition-[width,box-shadow] duration-300 ease-out",
            compact ? "w-[80px]" : collapsed ? "w-[132px]" : "w-[264px] shadow-2xl",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 px-4",
              collapsed ? "h-14 justify-center px-0" : "h-16",
            )}
          >
            <Link
              to="/"
              title={t("nav./")}
              aria-label={t("nav./")}
              className="shrink-0 rounded-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt=""
                  className="h-9 w-9 rounded-xl bg-white object-contain p-0.5"
                />
              ) : (
                <Logo className="h-9 w-9" />
              )}
            </Link>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-foreground">{t("app.name")}</p>
                </div>
                <NotificationBell />
              </>
            )}
          </div>

          {/* The bell sits beside the name when the menu is open; on the rail
          it is a compact button under the person's tile (amoCRM's place). */}
          {collapsed ? (
            <div className={cn(RAIL_STACK, compact ? "px-1.5" : "px-3")}>
              <SearchButton collapsed onOpen={onOpenSearch} />
            </div>
          ) : (
            <SearchButton collapsed={false} onOpen={onOpenSearch} />
          )}
          <nav
            data-tour="nav"
            className={cn(
              "flex-1 overflow-y-auto py-1.5",
              collapsed ? RAIL_STACK : "space-y-0.5",
              compact ? "px-1.5 [scrollbar-width:none]" : "px-3",
            )}
          >
            {ungroupedItems.map((item) => renderItem(item))}
            {renderGroup("nav.groupGeneral", generalItems)}
            {renderGroup("nav.groupAnalytics", analysisItems)}
            {renderGroup("nav.groupControl", controlItems)}
          </nav>

          <div className={cn("border-t border-sidebar-border", compact ? "p-1.5" : "p-3")}>
            <div className={cn(collapsed && RAIL_STACK)}>{renderItem(settingsItem)}</div>

            <div className={collapsed ? "mt-2.5" : "mt-1.5"}>
              <UserMenu collapsed={collapsed} isAdmin={isAdmin} onEditProfile={onEditProfile} />
            </div>
            {/* The notifications drawer: it opens from the user menu ("Xabarlar"). */}
            <RailNotifications railWidth={compact ? 80 : collapsed ? 132 : 264} hideButton />
            {/* On the rail: opens the menu, right under the user card. */}
            {collapsed && (
              <button
                type="button"
                onClick={onToggle}
                aria-label={t("nav.expand")}
                title={`${t("nav.expand")} · ⌘B`}
                className="group mx-auto mt-1.5 flex h-8 w-[50px] items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 via-sky-500/10 to-violet-500/20 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_28%,transparent)] transition-all hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_55%,transparent),0_6px_16px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
              >
                <ChevronsLeft className="h-4 w-4 rotate-180 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}

            <button
              onClick={onToggle}
              className={cn(
                "mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-accent hover:text-foreground",
                collapsed && "hidden",
              )}
            >
              <ChevronsLeft
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  collapsed && "rotate-180",
                )}
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
      </div>
    </TooltipProvider>
  );
}
