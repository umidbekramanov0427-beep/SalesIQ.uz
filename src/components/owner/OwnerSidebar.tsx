import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/layout/AppSidebar";
import { usePlatformSupportThreads, useSubscriptionRequestsRaw } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { TONE_TILE } from "@/lib/tones";
import { NavTip } from "@/components/layout/NavTip";
import { Moon, Sun } from "lucide-react";

// The platform owner's menu, in the admin console's look: always open,
// 230px, the owner's pages in four groups (Biznes, Nazorat, Aloqa, Tizim)
// under mono captions, each with its section's coloured icon tile; the open
// page is lit in signal blue with a glowing edge. Waiting support chats and
// renewal requests show as counts; day/night sits above the person's menu.

const GROUPS = ["business", "control", "comms", "system"] as const;

export function ownerNavItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.platformOwnerOnly);
}

function isActive(item: NavItem, pathname: string) {
  if (item.to === "/platform/companies")
    return (
      pathname.startsWith("/platform/companies") ||
      pathname.startsWith("/platform/organizations") ||
      pathname.startsWith("/platform/usage")
    );
  if (item.to === "/platform/sessions")
    return pathname.startsWith("/platform/sessions") || pathname.startsWith("/platform/visit");
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

export function OwnerSidebar({ onEditProfile }: { onEditProfile: () => void }) {
  const { t } = useI18n();

  return (
    <aside className="owner-sidebar hidden h-dvh w-[230px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex phone:hidden">
      <div className="flex h-[68px] items-center gap-3 border-b border-sidebar-border px-4">
        <Link to="/platform/companies" aria-label={t("app.name")} className="shrink-0">
          <Logo className="h-9 w-9" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold leading-tight tracking-tight text-foreground">
            {t("app.name")}
          </p>
          <p className="console-caption mt-0.5 flex items-center gap-1.5 !text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
            {t("owner.badge")} panel
          </p>
        </div>
      </div>
      <OwnerNav className="flex-1 overflow-y-auto px-3 pb-3 pt-4" />
      <div className="space-y-2 border-t border-sidebar-border p-3">
        <OwnerThemeSwitch />
        <UserMenu collapsed={false} isAdmin={false} onEditProfile={onEditProfile} />
      </div>
    </aside>
  );
}

/** The owner's menu items in their groups: the sidebar and the phone's drawer. */
export function OwnerNav({
  className,
  onNavigate,
}: {
  className?: string | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = ownerNavItems();
  const { data: support } = usePlatformSupportThreads();
  const { data: requests } = useSubscriptionRequestsRaw();
  const counts: Record<string, number> = {
    "/platform/support": support?.stats.waiting ?? 0,
    "/platform/notifications": (requests ?? []).filter((r) => r.status === "pending").length,
  };
  return (
    <nav className={cn("space-y-5", className)}>
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.ownerGroup === g);
        if (list.length === 0) return null;
        return (
          <div key={g}>
            <p className="console-caption px-2.5 pb-1.5 !text-[10px]">{t(`owner.group.${g}`)}</p>
            <div className="space-y-0.5">
              {list.map((item) => {
                const active = isActive(item, pathname);
                const count = counts[item.to] ?? 0;
                return (
                  <div key={item.to} className="relative">
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex h-10 items-center gap-2.5 rounded-xl pl-2 pr-7 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-primary/[0.09] font-semibold text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
                          : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-primary shadow-[0_0_10px_var(--console-glow,var(--primary))]"
                        />
                      )}
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
                          TONE_TILE[item.tone],
                          !active && "opacity-85 group-hover:opacity-100",
                        )}
                      >
                        <item.icon className="h-[15px] w-[15px]" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t(`nav.${item.to}`)}</span>
                      {count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 font-mono text-[10.5px] font-bold tabular-nums text-white shadow-[0_0_10px_-2px_rgb(244_63_94/0.7)]">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                    <NavTip to={item.to} className="absolute right-2 top-1/2 -translate-y-1/2" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Day / night, as two halves of one switch. */
export function OwnerThemeSwitch() {
  const { t } = useI18n();
  const { dark, setDark } = useTheme();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-[var(--console-tint,transparent)] p-1">
      {(
        [
          ["light", Sun, t("console.day")],
          ["dark", Moon, t("console.night")],
        ] as const
      ).map(([m, Icon, label]) => {
        const on = m === "dark" ? dark : !dark;
        return (
          <button
            key={m}
            type="button"
            onClick={() => setDark(m === "dark")}
            aria-pressed={on}
            className={cn(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors",
              on
                ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),inset_0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", on && "text-primary")} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
