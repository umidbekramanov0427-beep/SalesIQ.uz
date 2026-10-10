import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnderTabsProvider } from "@/components/layout/Primitives";

// The two shapes every settings area now shares:
//  - a section's main window is a HUB of status tiles (what is set up, what
//    isn't), each opening its page;
//  - inside, a page sits under a TABBED header (the section's pages as tabs,
//    sub-pages as pills) so moving between them never needs a back link.

export type NavTarget = { to: string; search?: Record<string, string> | undefined };

export type TileTone = "ok" | "warn" | "neutral";

export function HubGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <HubGrid>{children}</HubGrid>
    </section>
  );
}

export function HubGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
      {children}
    </div>
  );
}

const TONE_DOT: Record<TileTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  neutral: "bg-muted-foreground/40",
};

export function HubTile({
  to,
  search,
  icon: Icon,
  title,
  status,
  tone,
  badge,
}: NavTarget & {
  icon: LucideIcon;
  title: string;
  // One line on the tile's current state ("2 ta ulangan", "Sozlanmagan").
  status?: ReactNode | undefined;
  tone?: TileTone | undefined;
  badge?: ReactNode | undefined;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className="group flex min-h-[148px] flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {badge}
      </div>
      <div className="mt-auto min-w-0">
        <p className="text-base font-semibold leading-snug text-foreground">{title}</p>
        {status && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] leading-snug text-muted-foreground">
            {tone && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />}
            <span className="min-w-0">{status}</span>
          </p>
        )}
      </div>
    </Link>
  );
}

export type TabItem = NavTarget & { key: string; label: string; active: boolean };

export function TabbedSection({
  title,
  description,
  tabs,
  subTabs,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  tabs: TabItem[];
  subTabs?: TabItem[] | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <>
      <header className="mb-6 border-b border-border">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <nav aria-label={title} className="-mb-px mt-5 flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              to={tab.to as never}
              search={tab.search as never}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 text-sm font-medium transition-colors",
                tab.active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      {subTabs && subTabs.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-1.5">
          {subTabs.map((tab) => (
            <Link
              key={tab.key}
              to={tab.to as never}
              search={tab.search as never}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center whitespace-nowrap rounded-lg px-3.5 text-sm transition-colors",
                tab.active
                  ? "bg-accent font-medium text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
      <UnderTabsProvider value={true}>{children}</UnderTabsProvider>
    </>
  );
}
