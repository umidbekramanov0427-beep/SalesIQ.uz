import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { canUseCrm } from "@/lib/marketing";
import { moveSessionToPanel } from "@/lib/subdomain-handoff";
import { isPlatformHost } from "@/lib/subdomain";
import { useMyOrganization } from "@/hooks/use-crm-data";

// The marketing panel's own frame (marketing.salesiq.uz): its own menu --
// overview, ads, lead quality, settings -- and a switch back to the CRM for
// the people who also work there. The CRM's sidebar, phone, incoming calls
// and chat pop-ups don't load here.

type Item = { to: string; icon: LucideIcon; key: string; tone: string };

export const MARKETING_NAV: Item[] = [
  { to: "/marketing", icon: LayoutDashboard, key: "overview", tone: "text-sky-600" },
  { to: "/marketing/ads", icon: Megaphone, key: "ads", tone: "text-rose-600" },
  { to: "/marketing/quality", icon: Sparkles, key: "quality", tone: "text-violet-600" },
  { to: "/marketing/settings", icon: Settings2, key: "settings", tone: "text-slate-500" },
];

const isActive = (to: string, pathname: string) =>
  to === "/marketing"
    ? pathname === "/marketing" || pathname === "/marketing/"
    : pathname.startsWith(to);

function useToCrm() {
  const { user } = useAuth();
  return () => {
    if (!user) return;
    // On salesiq.uz itself the panels sit on one address: just navigate.
    if (!isPlatformHost(window.location.host)) {
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
    <div className="app-canvas flex h-dvh w-full overflow-hidden bg-canvas">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 phone:hidden">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <Footer />
      </aside>

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
          className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-16 pt-5 phone:px-3 phone:pb-[calc(76px+env(safe-area-inset-bottom))] phone:pt-3"
        >
          <div key={pathname} className="page-enter mx-auto w-full max-w-[1280px]">
            {children}
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
  );
}
