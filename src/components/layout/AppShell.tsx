import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Globe, Menu, Moon, Search, Sun, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { AmbientWaves } from "./AmbientWaves";
import { NAV_ITEMS } from "@/lib/nav";
import { recordVisit } from "@/lib/nav-history";
import { useI18n, LANGS, LANG_SHORT, LANG_LABELS } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/CommandPalette";
import { TrialBanner } from "@/components/TrialBanner";
import { useMyOrganization } from "@/hooks/use-crm-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { t, lang, setLang } = useI18n();
  const { dark, toggle: toggleDark } = useTheme();
  const { user, signOut } = useAuth();
  const { data: org } = useMyOrganization();
  const orgName = org?.name ?? null;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Gates admin-only regular-org nav (e.g. the "Admin panel" header link)
  // for a super_admin. A platform_owner still passes this today, but their
  // own sidebar (see AppSidebar/mobile drawer below) always shows the
  // dedicated platform-only nav regardless -- they never reach the regular
  // org sidebar that this flag would otherwise gate.
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const isPlatformOwner = user?.role === "platform_owner";
  // Exact match first: several /platform/* sub-pages share the "/platform"
  // prefix, so a plain prefix search would always resolve to the bare
  // "Platform" item instead of e.g. "Users" on /platform/users.
  const current =
    NAV_ITEMS.find((i) => i.to === pathname) ??
    NAV_ITEMS.find((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));

  useEffect(() => setMobileOpen(false), [pathname]);

  // Feeds AdminBackLink (and anything else that needs to know where the
  // user actually came from) -- see src/lib/nav-history.ts.
  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);

  // The sidebar is wide open the moment you land on the platform (whichever
  // page that happens to be -- "/" included), then collapses the instant
  // you actually navigate anywhere, so that page gets the full screen width
  // instead of sharing it with nav chrome you're not using anymore. "/" is
  // itself a real section (Reyting), not a permanent home base, so it
  // collapses like every other destination once you navigate to it -- only
  // the very first render is exempt. This fires on pathname changes (not on
  // every render while already on a page), so a manual re-expand/collapse
  // while staying put still sticks.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setCollapsed(true);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // h-dvh (not h-screen/100vh, and not min-h-screen) + overflow-hidden on
    // the page itself -- the page never scrolls; <main> below is the one
    // scroll container. This is what makes a full-height panel (Settings'
    // nav, the AI assistant) reliable: it can size itself with a plain
    // h-full against main's real content box instead of a viewport-relative
    // calc() that has to separately account for the header, an optional
    // trial banner, and whatever a given browser zoom rounds pixels to --
    // any of which drifting by even a few px is what read as the sidebar
    // "not quite reaching the bottom" while the icon rail (a sibling,
    // unaffected by any of that) stayed put. 100vh is the OTHER half of
    // that same class of bug on mobile Chrome/Safari specifically: it's
    // sized to the tallest the viewport can ever get (address bar hidden),
    // so with it the whole shell -- header, <main>, its bottom padding,
    // everything -- silently ran taller than what's actually on screen
    // whenever the address bar was showing, hiding the last chunk of
    // content behind the browser's own UI instead of leaving it scrollable
    // into view. 100dvh tracks the real visible viewport as that chrome
    // shows/hides, so it doesn't.
    <div className="flex h-dvh w-full overflow-hidden bg-surface">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        isAdmin={isAdmin}
        isPlatformOwner={isPlatformOwner}
      />

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[264px] overflow-y-auto border-r border-sidebar-border bg-sidebar p-3">
            <div className="flex items-center justify-between px-2 pb-4 pt-2">
              <p className="text-sm font-semibold">{t("app.name")}</p>
              <button
                aria-label={t("shell.closeMenu")}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1 hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.filter((i) =>
                // A platform owner's job is running the platform, not any
                // one company's CRM -- same rule the desktop sidebar
                // applies (see AppSidebar's mainItems/platformItems split),
                // so the two don't disagree on mobile vs. desktop. Every
                // other role must never see a platformOwnerOnly item, which
                // the old `if (isPlatformOwner) ...; if (i.adminOnly) ...;
                // return true` chain silently failed to exclude for them.
                isPlatformOwner
                  ? !!i.platformOwnerOnly
                  : (!i.adminOnly || isAdmin) && !i.platformOwnerOnly,
              ).map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-sidebar-active text-foreground"
                        : "text-sidebar-foreground hover:bg-accent",
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    {t(`nav.${item.to}`)}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        {/* Brand waves behind the working area -- outside <main>'s scroll
            container so they stay put while content scrolls over them.
            -z-10 inside this `isolate` column puts them above the shell's
            bg-surface but under everything in it, without turning <main>
            into its own stacking context (which would trap in-page
            dropdowns' z-index under the sticky header). */}
        <AmbientWaves className="absolute inset-0 -z-10" />
        <TrialBanner />
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <button
            aria-label={t("shell.openMenu")}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold text-foreground">
              {current ? t(`nav.${current.to}`) : t("shell.workspace")}
            </p>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            aria-label={t("shell.globalSearch")}
            className="relative ml-auto hidden h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-subtle transition-colors hover:border-primary/40 md:flex"
          >
            <Search className="h-4 w-4" />
            {t("shell.search")}
            <kbd className="ml-auto rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            <button
              aria-label={t("shell.globalSearch")}
              onClick={() => setPaletteOpen(true)}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>

            <button
              aria-label={t("shell.theme")}
              onClick={toggleDark}
              className="hidden rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
            >
              {dark ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("shell.language")}
                className="hidden items-center gap-1 rounded-xl p-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
              >
                <Globe className="h-[18px] w-[18px]" />
                {LANG_SHORT[lang]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {LANGS.map((l) => (
                  <DropdownMenuItem key={l} onClick={() => setLang(l)}>
                    {LANG_LABELS[l]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-1.5 pl-1.5 pr-3 transition-colors hover:bg-accent">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                  {user?.initials ?? "?"}
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block text-[13px] font-bold text-foreground">
                    {user?.name ?? "…"}
                  </span>
                  {orgName && (
                    <span className="block truncate text-[11px] text-subtle">{orgName}</span>
                  )}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user?.name ?? ""}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">{t("shell.profile")}</Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">{t("shell.admin")}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    void navigate({ to: "/login", replace: true });
                  }}
                >
                  {t("shell.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* overflow-x-hidden is a safety net: a page whose own content
            turns out even a few px too wide (a stray fixed width, an
            un-wrapped flex row) would otherwise drag the WHOLE page
            sideways instead of just that one element -- exactly the "text
            cut off at both edges while scrolling" bug reported on a phone.
            Each page's own horizontally-scrollable bits (tables, the
            kanban board, filter rows) keep scrolling fine since they
            establish their own inner scroll container; this only clips
            overflow that was never supposed to happen. */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4 pt-4 md:px-6 md:pb-6">
          <div className="h-full w-full">
            {children}
            {/* A real block, not just scroll-container padding -- two earlier
                rounds of bumping this pane's pb-* (pb-16 -> pb-28 -> pb-36)
                still read as the last card touching the viewport edge on a
                real phone (confirmed via screenshots: the final card's border
                sat flush against the browser chrome with nothing below it).
                Padding-at-the-end-of-a-scroll-container depends on the
                browser correctly including it in scrollable overflow, which
                evidently isn't holding up platform-wide on mobile Chrome --
                an explicit trailing element can't have that problem, since
                it's real content the browser has to scroll past regardless. */}
            <div aria-hidden className="h-16 md:h-20" />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
