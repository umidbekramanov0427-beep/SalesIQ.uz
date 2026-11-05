import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Search } from "lucide-react";
import { cardTitleKey, useAdminCatalog, type CatalogItem } from "@/components/admin/AdminCatalog";
import { TONE_TEXT } from "@/lib/tones";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Sozlamalar the amoCRM way: every setting of the company in one list on
// the left, grouped as on the admin panel, and the chosen page on the
// right -- no going back to the card catalog between settings. Desktop
// only; on phones the admin panel stays one card list.

function isActive(item: CatalogItem, pathname: string, search: Record<string, unknown>) {
  if (!pathname.startsWith(item.to)) return false;
  if (!item.search) return true;
  return Object.entries(item.search).every(([k, v]) => search[k] === v);
}

export function SettingsNav() {
  const { t } = useI18n();
  const groups = useAdminCatalog();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // The open setting stays in view in the list.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  const shown = groups
    .map((g) => ({
      ...g,
      items: q ? g.items.filter((it) => t(cardTitleKey(it)).toLowerCase().includes(q)) : g.items,
    }))
    .filter((g) => g.items.length);

  return (
    <nav
      aria-label={t("snav.title")}
      className="flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="border-b border-border p-3">
        <Link
          to="/admin"
          className={cn(
            "mb-2 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-bold transition-colors",
            pathname === "/admin"
              ? "bg-primary/10 text-[var(--primary-ink)]"
              : "text-foreground hover:bg-accent",
          )}
        >
          <LayoutGrid className="h-4 w-4 text-primary" /> {t("snav.title")}
        </Link>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("hub.search")}
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-[13px] outline-none placeholder:text-subtle focus:border-primary/60"
          />
        </label>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] text-muted-foreground">
            {t("hub.nothingFound")}
          </p>
        ) : (
          shown.map((g) => (
            <div key={g.key}>
              <p className="px-2.5 pb-1 pt-3.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-subtle">
                {t(`hub.group.${g.key}`)}
              </p>
              {g.items.map((item) => {
                const on = isActive(item, pathname, search);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key + (item.search ? JSON.stringify(item.search) : "")}
                    to={item.to}
                    search={(item.search ?? {}) as never}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
                      on
                        ? "bg-primary/10 font-semibold text-foreground shadow-[inset_2px_0_0_var(--primary)]"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", TONE_TEXT[item.tone])} />
                    <span className="min-w-0 flex-1 truncate">{t(cardTitleKey(item))}</span>
                    {item.status && !item.status.ok && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))
        )}
      </div>
    </nav>
  );
}

/** The settings page frame: the list on the left (desktop), the page on the right. */
export function SettingsFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] phone:block">
      <aside className="hidden self-start lg:sticky lg:top-0 lg:block phone:hidden">
        <SettingsNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
