import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { getPreviousPath } from "@/lib/nav-history";
import { NAV_ITEMS, NAV_LABEL_PATHS, appRoleOf, homePathFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

// "Orqaga" on every page (PageHeader renders it). When this tab came from
// another page it is a real history.back() -- the previous page comes back
// with its filters and scroll offset. Opened directly (a link, a refresh)
// it goes to the page's parent instead: a card's hub, a lead's funnels,
// a company's list.

const CHIP =
  "group inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13px] font-semibold phone:h-8 phone:px-3 phone:text-[12.5px] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** Where a page belongs when there is no page to go back to. */
export function parentPathOf(pathname: string, superAdmin: boolean, home: string): string {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (pathname.startsWith("/admin/")) return "/admin";
  if (pathname.startsWith("/daily-report-settings/")) return "/daily-report-settings";
  if (under("/integrations") || under("/rollout-plan") || under("/onboarding"))
    return superAdmin ? "/admin" : home;
  if (under("/scoring-criteria") || under("/daily-report-settings"))
    return superAdmin ? "/admin" : "/settings";
  if (under("/crm")) return "/funnels";
  if (under("/platform/organizations") || under("/platform/usage")) return "/platform/companies";
  if (under("/platform/visit")) return "/platform/sessions";
  if (pathname.startsWith("/help/")) return "/help";
  return home;
}

export function useGoBack() {
  const router = useRouter();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const previous = getPreviousPath();
  const isOwner = user?.role === "platform_owner";
  const home = isOwner ? "/platform/companies" : homePathFor(appRoleOf(user));
  const superAdmin = user?.role === "super_admin" || isOwner;
  const fallback = parentPathOf(pathname, superAdmin, home);
  const target = previous ?? (fallback !== pathname ? fallback : undefined);
  return {
    target,
    go: () => {
      if (previous) router.history.back();
      else if (target) void router.navigate({ to: target });
    },
  };
}

function useBackLabel(target: string): string {
  const { t } = useI18n();
  if (target === "/admin") return t("admin.backToPanel");
  const matched = NAV_LABEL_PATHS.find(
    (p) => p === target || (p !== "/" && target.startsWith(`${p}/`)),
  );
  return matched ? t("admin.backToSection", { name: t(`nav.${matched}`) }) : t("admin.backGeneric");
}

export function BackButton({ className }: { className?: string }) {
  const { target, go } = useGoBack();
  const label = useBackLabel(target ?? "");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!target) return null;
  // On a phone the tab bar already leads to every main section.
  const topLevel = NAV_ITEMS.some((i) => i.to === pathname);
  return (
    <button type="button" onClick={go} className={cn(CHIP, className, topLevel && "phone:hidden")}>
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      {label}
    </button>
  );
}

/** The same chip for a fixed destination (e.g. a guide back to the guides). */
export function BackChip({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={cn(CHIP, "mb-5")}>
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {label}
    </Link>
  );
}
