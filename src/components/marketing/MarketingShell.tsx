import { SettingsLayout } from "@/components/layout/Primitives";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  LayoutDashboard,
  Laptop,
  LogOut,
  Moon,
  Sun,
  Megaphone,
  Menu,
  Send,
  Settings2,
  Sparkles,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { canUseCrm } from "@/lib/marketing";
import { moveSessionToPanel } from "@/lib/subdomain-handoff";
import { isPlatformHost, panelFromHost } from "@/lib/subdomain";
import { useMyOrganization } from "@/hooks/use-crm-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RAIL_ITEM, RAIL_LABEL, RAIL_STACK, RAIL_TILE } from "@/components/layout/AppSidebar";
import { RailGlyph } from "@/components/layout/RailGlyph";
import { useBrowserZoom } from "@/lib/browser-zoom";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { LANGS, LANG_FLAGS, LANG_SHORT, type Lang } from "@/lib/i18n";
import { MarketingFiltersProvider } from "@/components/marketing/MarketingFilters";

// The marketing panel's own frame (marketing.salesiq.uz): the platform's
// narrow icon rail, always folded -- overview, ads, lead quality, channels,
// webinars, settings -- with the switch back to the CRM and the person's
// tile (theme, language, sign out) at the bottom. The project and period
// filters live here too (MarketingFiltersProvider). The CRM's sidebar,
// phone, incoming calls and chat pop-ups don't load here.

type Item = { to: string; icon: LucideIcon; key: string; tone: string };

export const MARKETING_NAV: Item[] = [
  {
    to: "/marketing",
    icon: LayoutDashboard,
    key: "overview",
    tone: "text-sky-600 dark:text-sky-400",
  },
  { to: "/marketing/ads", icon: Megaphone, key: "ads", tone: "text-rose-600 dark:text-rose-400" },
  {
    to: "/marketing/quality",
    icon: Sparkles,
    key: "quality",
    tone: "text-violet-600 dark:text-violet-400",
  },
  {
    to: "/marketing/channels",
    icon: Send,
    key: "channels",
    tone: "text-sky-600 dark:text-sky-400",
  },
  {
    to: "/marketing/webinars",
    icon: Video,
    key: "webinars",
    tone: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    to: "/marketing/settings",
    icon: Settings2,
    key: "settings",
    tone: "text-slate-500 dark:text-slate-300",
  },
];

const isActive = (to: string, pathname: string) =>
  to === "/marketing"
    ? pathname === "/marketing" || pathname === "/marketing/"
    : to === "/marketing/settings"
      ? pathname.startsWith(to) || pathname.startsWith("/marketing/projects")
      : pathname.startsWith(to);

function useToCrm() {
  const { user } = useAuth();
  return () => {
    if (!user) return;
    // On salesiq.uz itself the panels sit on one address: just navigate.
    if (!isPlatformHost(window.location.host) || panelFromHost(window.location.host) === "crm") {
      window.location.assign("/");
      return;
    }
    void moveSessionToPanel("crm", user.orgSubdomain, "/");
  };
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1">
      {MARKETING_NAV.map((item) => {
        const active = isActive(item.to, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors",
              active
                ? "bg-sidebar-active text-foreground"
                : "text-sidebar-foreground hover:bg-accent",
            )}
          >
            <item.icon className={cn("h-[18px] w-[18px]", item.tone)} />
            {t(`mkt.nav.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const toCrm = useToCrm();
  return (
    <div className="space-y-2 border-t border-sidebar-border pt-3">
      {canUseCrm(user) && (
        <button
          type="button"
          onClick={toCrm}
          className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5 text-[13.5px] font-semibold text-primary hover:bg-primary/12"
        >
          <ArrowLeftRight className="h-[18px] w-[18px]" />
          {t("mkt.toCrm")}
        </button>
      )}
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint text-[12px] font-semibold text-mint-foreground">
          {user?.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{user?.name}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {t(
              user?.role === "marketolog"
                ? "admin.roleMarketolog"
                : user?.role === "super_admin" || user?.role === "platform_owner"
                  ? "admin.roleAdmin"
                  : "mkt.guestRole",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label={t("subdomain.signOut")}
          title={t("subdomain.signOut")}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  const { data: org } = useMyOrganization();
  return (
    <div className="flex items-center gap-2.5 px-2 pb-5 pt-1">
      <Logo className="h-9 w-9" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight text-foreground">
          {org?.name || "SalesIQ"}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-600">
          {t("mkt.brand")}
        </p>
      </div>
    </div>
  );
}

/** The desktop menu: the platform's folded rail, it never opens wider. */
function Rail() {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const toCrm = useToCrm();
  // Like the CRM's rail: it keeps its size whatever the page zoom.
  const zoom = useBrowserZoom();
  const frame: CSSProperties | undefined =
    zoom === 1 ? undefined : { zoom: 1 / zoom, height: `calc(100dvh * ${zoom})` };
  const main = MARKETING_NAV.filter((i) => i.key !== "settings");
  const settings = MARKETING_NAV.find((i) => i.key === "settings")!;
  const item = (it: Item) => {
    const active = isActive(it.to, pathname);
    return (
      <Link
        key={it.to}
        to={it.to}
        className={cn(
          "group flex items-center transition-colors duration-150",
          RAIL_ITEM,
          active
            ? "bg-sidebar-active font-bold text-sidebar-active-foreground shadow-soft"
            : "font-semibold text-sidebar-foreground hover:bg-accent",
        )}
      >
        <RailGlyph icon={it.icon} active={active} className={it.tone} />
        <span className={RAIL_LABEL}>{t(`mkt.nav.${it.key}`)}</span>
      </Link>
    );
  };
  return (
    <div className="relative h-dvh w-[80px] shrink-0 phone:hidden" style={frame}>
      <aside className="absolute left-0 top-0 z-40 flex h-full w-[80px] flex-col border-r border-sidebar-border bg-background">
        <div className="flex h-14 items-center justify-center">
          <Link
            to="/marketing"
            aria-label={t("mkt.brand")}
            className="rounded-xl transition-transform hover:scale-105"
          >
            <Logo className="h-9 w-9" />
          </Link>
        </div>
        <p className="-mt-1 mb-2 text-center text-[8.5px] font-bold uppercase tracking-[0.14em] text-rose-600">
          {t("mkt.brand")}
        </p>
        <nav
          className={cn("flex-1 overflow-y-auto px-1.5 py-1.5 [scrollbar-width:none]", RAIL_STACK)}
        >
          {main.map(item)}
        </nav>
        <div className="border-t border-sidebar-border p-1.5">
          <div className={RAIL_STACK}>
            {item(settings)}
            {canUseCrm(user) && (
              <button
                type="button"
                onClick={toCrm}
                title={t("mkt.toCrm")}
                className={cn(
                  "group flex items-center font-semibold text-primary transition-colors hover:bg-primary/10",
                  RAIL_ITEM,
                )}
              >
                <RailGlyph icon={ArrowLeftRight} className="text-primary" />
                <span className={RAIL_LABEL}>{t("mkt.crmShort")}</span>
              </button>
            )}
          </div>
          <div className="mt-2.5">
            <PersonTile />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The person's tile at the bottom: who, the theme, the language, sign out. */
function PersonTile() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { user, signOut } = useAuth();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("userMenu.open")}
          title={user?.name ?? undefined}
          className={RAIL_TILE}
        >
          <span className="text-[15px] font-extrabold leading-none tracking-wide transition-transform group-hover:scale-110">
            {user?.initials ?? "?"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={12}
        className="w-72 overflow-hidden rounded-2xl p-0"
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            {user?.initials ?? "?"}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold text-foreground">{user?.name ?? "…"}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {t(
                user?.role === "marketolog"
                  ? "admin.roleMarketolog"
                  : user?.role === "super_admin" || user?.role === "platform_owner"
                    ? "admin.roleAdmin"
                    : "mkt.guestRole",
              )}
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
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t("subdomain.signOut")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);
  const current = MARKETING_NAV.find((i) => isActive(i.to, pathname));

  return (
    <MarketingFiltersProvider>
      <div className="app-canvas flex h-dvh w-full overflow-hidden bg-canvas">
        <Rail />

        {open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-foreground/20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 flex h-full w-[min(300px,86vw)] flex-col border-r border-sidebar-border bg-sidebar p-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
              <div className="flex items-start justify-between">
                <Brand />
                <button
                  aria-label={t("shell.closeMenu")}
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <Footer />
            </div>
          </div>
        )}

        <div className="relative isolate flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 hidden shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur phone:flex">
            <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5">
              <Logo className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold leading-tight text-foreground">
                  {current ? t(`mkt.nav.${current.key}`) : t("mkt.brand")}
                </p>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-rose-600">
                  {t("mkt.brand")}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("shell.openMenu")}
              onClick={() => setOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
            >
              <Menu className="h-5 w-5" />
            </button>
          </header>
          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-16 pt-5 md:px-6 phone:px-3 phone:pb-[calc(76px+env(safe-area-inset-bottom))] phone:pt-3"
          >
            <div key={pathname} className="page-enter w-full">
              <SettingsLayout variant="admin" gutter={false}>
                {children}
              </SettingsLayout>
            </div>
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur phone:flex">
          {MARKETING_NAV.map((item) => {
            const active = isActive(item.to, pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <item.icon className={cn("h-5 w-5", active && item.tone)} />
                {t(`mkt.nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>
      </div>
    </MarketingFiltersProvider>
  );
}
