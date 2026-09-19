import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Globe, Menu, Moon, Search, Sun, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { NAV_ITEMS } from "@/lib/nav";
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
  // A platform owner who's also a member of their own organization (this
  // session's whole setup) runs it day to day, so they need everything a
  // super_admin gets, not just the platform-management screens.
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const isPlatformOwner = user?.role === "platform_owner";
  // Exact match first: several /platform/* sub-pages share the "/platform"
  // prefix, so a plain prefix search would always resolve to the bare
  // "Platform" item instead of e.g. "Users" on /platform/users.
  const current =
    NAV_ITEMS.find((i) => i.to === pathname) ??
    NAV_ITEMS.find((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));

  useEffect(() => setMobileOpen(false), [pathname]);

  // Settings has its own second-level sidebar (scoring/lead-CRM/reports
  // groups) -- showing the full app sidebar alongside it at the same time
  // doubles up on navigation chrome, so entering /settings auto-collapses
  // the main one. Only fires on the transition into /settings, not on
  // every render while already there, so a manual re-expand while still on
  // the page sticks.
  useEffect(() => {
    if (pathname === "/settings") setCollapsed(true);
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
    // h-screen + overflow-hidden on the page itself (not min-h-screen) --
    // the page never scrolls; <main> below is the one scroll container.
    // This is what makes a full-height panel (Settings' nav, the AI
    // assistant) reliable: it can size itself with a plain h-full against
    // main's real content box instead of a viewport-relative calc() that
    // has to separately account for the header, an optional trial banner,
    // and whatever a given browser zoom rounds pixels to -- any of which
    // drifting by even a few px is what read as the sidebar "not quite
    // reaching the bottom" while the icon rail (a sibling, unaffected by
    // any of that) stayed put.
    <div className="flex h-screen w-full overflow-hidden bg-surface">
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
              {NAV_ITEMS.filter((i) => {
                // A platform owner with no organization of their own has
                // nothing for the regular CRM/admin nav to show -- same
                // "clean, platform-only" rule the desktop sidebar already
                // applies (see AppSidebar's isPlatformOwner branch), so the
                // two don't disagree on mobile vs. desktop.
                if (isPlatformOwner && !user?.organizationId) return !!i.platformOwnerOnly;
                if (i.platformOwnerOnly) return isPlatformOwner;
                if (i.adminOnly) return isAdmin;
                return true;
              }).map((item) => {
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

      <div className="flex min-w-0 flex-1 flex-col">
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

        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <div className="h-full w-full">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
