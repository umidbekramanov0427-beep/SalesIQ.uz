import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CornerDownLeft,
  Search,
  Settings2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, appRoleOf, canOpenPath, navItemsFor, settingsPageItemsFor } from "@/lib/nav";
import { useCrmEnabled } from "@/lib/use-org-access";
import { SEARCH_CATALOG, catalogMatches } from "@/lib/search-catalog";
import { cn } from "@/lib/utils";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import { useGlobalLeadSearch } from "@/hooks/use-crm-data";

// Search across the platform -- pages, settings and leads -- in one card in
// the middle of the screen (the search button under the logo, or ⌘K). The
// results live inside the same card as the field, so nothing hangs loose
// below it. Who's signed in, the theme and the language are in the avatar
// menu at the bottom of the sidebar.

type Result = {
  key: string;
  group: "pages" | "settings" | "leads";
  icon: LucideIcon;
  /** Tile colour; pages use their sidebar colour. */
  tone?: CardTone | undefined;
  label: string;
  hint?: string | undefined;
  go: () => void;
};

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const crmEnabled = useCrmEnabled();
  const role = appRoleOf(user);
  const isPlatformOwner = user?.role === "platform_owner";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: leads = [], isFetching } = useGlobalLeadSearch(query, open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const go = (to: string, search?: Record<string, string>) => {
    onClose();
    void navigate({ to, ...(search ? { search } : {}) } as never);
  };

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const pages = isPlatformOwner
      ? NAV_ITEMS.filter((i) => i.platformOwnerOnly)
      : [...navItemsFor(role, crmEnabled), ...settingsPageItemsFor(role)];
    const pageResults: Result[] = pages
      .filter((i) => !q || catalogMatches(`${t(`nav.${i.to}`)} ${i.label} ${i.to}`, q))
      .slice(0, 8)
      .map((i) => ({
        key: `p-${i.to}`,
        group: "pages",
        icon: i.icon,
        tone: i.tone,
        label: t(`nav.${i.to}`),
        go: () => go(i.to),
      }));
    if (!q) return pageResults;
    const rank = { rop: 1, super_admin: 2 } as const;
    const mine = role === "super_admin" ? 2 : role === "rop" ? 1 : 0;
    const settingResults: Result[] = SEARCH_CATALOG.filter(
      (c) =>
        !isPlatformOwner &&
        canOpenPath(role, c.to, crmEnabled) &&
        (!c.minRole || mine >= rank[c.minRole]) &&
        catalogMatches(`${t(c.labelKey)} ${c.keywords}`, q),
    )
      .slice(0, 8)
      .map((c) => ({
        key: `s-${c.to}-${c.section ?? ""}`,
        group: "settings",
        icon: Settings2,
        label: t(c.labelKey),
        hint: c.section ? t("nav./settings") : undefined,
        go: () => go(c.to, c.section ? { section: c.section } : undefined),
      }));
    const leadResults: Result[] = leads.map((l) => ({
      key: `l-${l.id}`,
      group: "leads",
      icon: UserRound,
      label: l.company_name || l.name,
      hint: [l.contact?.full_name, l.contact?.phone, l.funnel].filter(Boolean).join(" · "),
      go: () => {
        onClose();
        void navigate({
          to: "/crm/leads/$leadId",
          params: { leadId: l.id },
          search: { from: "funnels" },
        });
      },
    }));
    return [...pageResults, ...settingResults, ...leadResults];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, leads, role, crmEnabled, isPlatformOwner, t]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const groups: { key: Result["group"]; label: string }[] = [
    { key: "pages", label: query.trim() ? t("accountBar.pages") : t("accountBar.quick") },
    { key: "settings", label: t("accountBar.settings") },
    { key: "leads", label: t("accountBar.leads") },
  ];
  const searching = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.title")}
        className="relative flex max-h-[72vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.3)] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                results[active]?.go();
              }
            }}
            placeholder={t("accountBar.searchPlaceholder")}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Esc
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.map((g) => {
            const items = results.filter((r) => r.group === g.key);
            if (!items.length) return null;
            return (
              <div key={g.key} className="py-1">
                <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
                  {g.label}
                </p>
                {items.map((r) => {
                  const idx = results.indexOf(r);
                  const on = idx === active;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      data-index={idx}
                      onMouseMove={() => setActive(idx)}
                      onClick={r.go}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                        on ? "bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                          r.tone ? TONE_TILE[r.tone] : "bg-muted text-muted-foreground",
                        )}
                      >
                        <r.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-foreground">
                          {r.label}
                        </span>
                        {r.hint && (
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {r.hint}
                          </span>
                        )}
                      </span>
                      {on && <ArrowRight className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {searching && !isFetching && results.length === 0 && (
            <p className="px-3 py-10 text-center text-[13px] text-subtle">
              {t("accountBar.nothing")}
            </p>
          )}
          {searching && isFetching && (
            <p className="px-3 py-2 text-[12px] text-subtle">{t("common.loading")}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4 border-t border-border bg-surface/60 px-4 py-2 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-card px-1 font-sans">↑</kbd>
            <kbd className="rounded border border-border bg-card px-1 font-sans">↓</kbd>
            {t("search.move")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="grid h-[18px] place-items-center rounded border border-border bg-card px-1">
              <CornerDownLeft className="h-3 w-3" />
            </kbd>
            {t("search.open")}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-card px-1 font-sans">⌘K</kbd>
            {t("search.shortcut")}
          </span>
        </div>
      </div>
    </div>
  );
}
