import { useEffect, useRef, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { OnlineStack } from "@/components/layout/OnlineTeam";
import { useI18n } from "@/lib/i18n";
import { useMyOrganization } from "@/hooks/use-crm-data";

// A page that opens as its own panel (Pul qaytarish from Voronkalar): no
// sidebar, a bar on top with the way back to where it was opened from.

export const FOCUS_PANELS: { path: string; back: string; backKey: string; titleKey: string }[] = [
  { path: "/refunds", back: "/funnels", backKey: "refund.backToFunnels", titleKey: "refund.title" },
];

export function focusPanelFor(pathname: string) {
  return FOCUS_PANELS.find((p) => pathname === p.path || pathname.startsWith(p.path + "/"));
}

export function FocusShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const panel = focusPanelFor(pathname);
  const { data: org } = useMyOrganization();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app-canvas flex h-dvh w-full flex-col overflow-hidden bg-canvas">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-6 pt-[env(safe-area-inset-top)] backdrop-blur phone:h-14 phone:px-3">
        <Link
          to={panel?.back ?? "/"}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-[13.5px] font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {t(panel?.backKey ?? "nav./")}
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <OnlineStack className="phone:hidden" />
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="min-w-0 text-right phone:hidden">
              <p className="truncate text-[13.5px] font-bold text-foreground">
                {org?.name || "SalesIQ"}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-600">
                {panel ? t(panel.titleKey) : ""}
              </p>
            </div>
            <Logo className="h-9 w-9 shrink-0" />
          </div>
        </div>
      </header>
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-16 pt-5 phone:px-3 phone:pb-8 phone:pt-3"
      >
        <div key={pathname} className="page-enter mx-auto w-full max-w-[1640px]">
          {children}
        </div>
      </main>
    </div>
  );
}
