import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, Menu, Search, ShieldCheck, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { MobileTabBar, MobileTopBar } from "./MobileNav";
import { AmbientWaves } from "./AmbientWaves";
import { PhoneProvider } from "@/components/phone/PhoneProvider";
import { OverdueTaskAlerts } from "@/components/crm/OverdueTaskAlerts";
import { IncomingCallPopup } from "@/components/phone/IncomingCallPopup";
import { SearchPalette } from "./SearchPalette";
import { ProfileDialog } from "./ProfileDialog";
import { useRegisterAutoAnalyzeClient } from "@/lib/auto-analyze";
import { useMentorDailyGreeting } from "@/hooks/use-intern-mentor";
import { useRecordLoginEvent } from "@/hooks/use-crm-data";
import { usePushResync } from "@/hooks/use-push-notifications";
import { startPwa } from "@/lib/pwa";
import { NAV_ITEMS, appRoleOf, canOpenPath, homePathFor, navItemsFor } from "@/lib/nav";
import { recordVisit } from "@/lib/nav-history";
import { useMainScrollMemory } from "@/lib/scroll-memory";
import { trail } from "@/lib/session-trail";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled } from "@/lib/use-org-access";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/tones";
import { TrialBanner } from "@/components/TrialBanner";
import { OwnerMfaReminder } from "@/components/auth/OwnerMfaReminder";
import { TelegramLinkReminder } from "@/components/auth/TelegramLinkReminder";
import { AiAssistantFab } from "@/components/ai/AiAssistantFab";
import { WelcomeTour } from "@/components/onboarding/WelcomeTour";

export function AppShell({ children }: { children: ReactNode }) {
  useRegisterAutoAnalyzeClient();
  useMentorDailyGreeting();
  useRecordLoginEvent();
  usePushResync();
  useEffect(() => startPwa(), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  // The search window (the button under the logo, or ⌘K) and the profile
  // window behind the pencil in the avatar menu.
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // <main> is the page's scroll container: new pages open at the top, a
  // page you come back to opens where you left it.
  const mainRef = useRef<HTMLElement>(null);
  useMainScrollMemory(mainRef);
  // Gates admin-only regular-org nav (e.g. the "Admin panel" header link)
  // for a super_admin. A platform_owner still passes this today, but their
  // own sidebar (see AppSidebar/mobile drawer below) always shows the
  // dedicated platform-only nav regardless -- they never reach the regular
  // org sidebar that this flag would otherwise gate.
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const isPlatformOwner = user?.role === "platform_owner";
  const role = appRoleOf(user);
  const crmEnabled = useCrmEnabled();
  // A page outside this role's menu (e.g. an intern typing /dashboard)
  // sends them home instead of rendering it.
  const pageAllowed = isPlatformOwner || canOpenPath(role, pathname, crmEnabled);
  // Exact match first: several /platform/* sub-pages share the "/platform"
  // prefix, so a plain prefix search would always resolve to the bare
  // "Platform" item instead of e.g. "Users" on /platform/users.
  const current =
    NAV_ITEMS.find((i) => i.to === pathname) ??
    NAV_ITEMS.find((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));

  const menuItems = isPlatformOwner
    ? NAV_ITEMS.filter((i) => i.platformOwnerOnly)
    : navItemsFor(role, crmEnabled).filter((i) => !i.adminOnly || isAdmin);

  useEffect(() => setMobileOpen(false), [pathname]);

  // A page outside this role's menu: noted for the visits report.
  useEffect(() => {
    if (!pageAllowed) trail("blocked", `page:${pathname}`, pathname);
  }, [pageAllowed, pathname]);

  // Feeds the "Orqaga" chip -- see src/lib/nav-history.ts. Recorded while
  // rendering (it only writes a map), so the page below already sees where
  // it was opened from on its first render.
  const historyIndex = useRouterState({
    select: (s) => (s.location.state as { __TSR_index?: number } | undefined)?.__TSR_index ?? 0,
  });
  recordVisit(historyIndex, pathname);

  // The sidebar is the slim icon rail on every page -- on arrival, after a
  // refresh, after a click -- so the working area gets the width. Hovering
  // an icon names the section; the toggle (or ⌘B) peeks the full menu open
  // until the next navigation.
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [pathname]);

  useEffect(() => setSearchOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setPeek(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setPeek((p) => !p);
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
    <PhoneProvider enabled={crmEnabled && !isPlatformOwner}>
      <div className="flex h-dvh w-full overflow-hidden bg-canvas">
        <AppSidebar
          collapsed={!peek}
          compact={!peek}
          onToggle={() => setPeek((p) => !p)}
          onOpenSearch={() => setSearchOpen(true)}
          onEditProfile={() => setProfileOpen(true)}
          isAdmin={isAdmin}
          isPlatformOwner={isPlatformOwner}
        />
        {/* The opened menu floats over the page (the page never shifts);
            a click beside it or Esc folds it back. */}
        {peek && (
          <div
            aria-hidden
            className="fixed inset-0 z-[35] hidden bg-foreground/10 lg:block"
            onClick={() => setPeek(false)}
          />
        )}

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-foreground/20"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[264px] overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 phone:w-[min(320px,86vw)] phone:pb-[max(12px,env(safe-area-inset-bottom))] phone:pt-[max(12px,env(safe-area-inset-top))]">
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
                {/* Same per-role list as the desktop sidebar; a platform
                  owner gets only the platform pages. */}
                {menuItems.map((item) => {
                  const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium phone:py-3 phone:text-[15px]",
                        active
                          ? "bg-sidebar-active text-foreground"
                          : "text-sidebar-foreground hover:bg-accent",
                      )}
                    >
                      <item.icon className={cn("h-[18px] w-[18px]", TONE_TEXT[item.tone])} />
                      {t(`nav.${item.to}`)}
                    </Link>
                  );
                })}
                <div className="my-2 border-t border-sidebar-border" />
                <Link
                  to="/help"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-accent phone:py-3 phone:text-[15px]"
                >
                  <BookOpen className="h-[18px] w-[18px] text-amber-600" />
                  {t("nav./help")}
                </Link>
                {isAdmin && !menuItems.some((i) => i.to === "/admin") && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-2.5 text-sm font-bold text-amber-700 dark:text-amber-300 phone:py-3 phone:text-[15px]"
                  >
                    <ShieldCheck className="h-[18px] w-[18px]" />
                    {t("nav./admin")}
                  </Link>
                )}
              </nav>
            </div>
          </div>
        )}

        <div className="relative isolate flex min-w-0 flex-1 flex-col">
          {/* Brand waves behind the working area -- outside <main>'s scroll
            container so they stay put while content scrolls over them.
            -z-10 inside this `isolate` column puts them above the shell's
            bg-canvas but under everything in it, without turning <main>
            into its own stacking context (which would trap in-page
            dropdowns' z-index under the sticky header). */}
          {/* The CRM board gets the same backdrop at about half strength, so
            it matches the rest of the platform without the waves competing
            with the lead cards it is worked in all day. The lead card page
            stays flat. */}
          {pathname.startsWith("/funnels") ? (
            <AmbientWaves className="absolute inset-0 -z-10 [--ambient-waves-opacity:0.045] dark:[--ambient-waves-opacity:0.08]" />
          ) : (
            !pathname.startsWith("/crm/leads/") && (
              <AmbientWaves className="absolute inset-0 -z-10" />
            )
          )}
          <TrialBanner />
          <OwnerMfaReminder />
          <TelegramLinkReminder />
          <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
          {/* Phones: the app bar (MobileNav.tsx, drawn first, above the
            reminders). Narrow computer windows: the header below. */}
          <MobileTopBar
            isAdmin={isAdmin}
            onOpenSearch={() => setSearchOpen(true)}
            onEditProfile={() => setProfileOpen(true)}
          />
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background px-4 lg:hidden phone:hidden">
            <button
              aria-label={t("shell.openMenu")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {current ? t(`nav.${current.to}`) : t("shell.workspace")}
            </p>
            <button
              type="button"
              aria-label={t("search.title")}
              onClick={() => setSearchOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted-foreground"
            >
              <Search className="h-4 w-4" />
            </button>
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
          <main
            ref={mainRef}
            className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4 pt-4 md:px-6 md:pb-6 phone:px-3 phone:pb-[calc(76px+env(safe-area-inset-bottom))] phone:pt-3"
          >
            {/* Keyed by path so each page plays its entrance (.page-enter in
                styles.css) once, when it is opened. */}
            <div key={pathname} className="page-enter h-full w-full">
              {pageAllowed ? children : <Navigate to={homePathFor(role)} replace />}
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
              <div aria-hidden className="pointer-events-none h-16 md:h-20 phone:h-4" />
            </div>
          </main>
        </div>

        <MobileTabBar items={menuItems} onOpenMenu={() => setMobileOpen(true)} />
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
        <OverdueTaskAlerts enabled={crmEnabled && !isPlatformOwner} />
        <IncomingCallPopup enabled={crmEnabled && !isPlatformOwner} />
        {!isPlatformOwner && <AiAssistantFab />}
        {!isPlatformOwner && <WelcomeTour />}
      </div>
    </PhoneProvider>
  );
}
