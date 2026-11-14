import { useEffect, useMemo, useRef, useState } from "react";
import { canOpenSection } from "@/lib/access-rules";
import { useAccessRules } from "@/hooks/use-crm-data";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  ListChecks,
  Users,
  Workflow,
  CornerDownLeft,
  Search,
  Settings2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, appRoleOf, canOpenPath, navItemsFor } from "@/lib/nav";
import { useCrmEnabled } from "@/lib/use-org-access";
import { SEARCH_CATALOG, catalogMatches } from "@/lib/search-catalog";
import { cn } from "@/lib/utils";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import {
  useFunnelNames,
  useGlobalLeadSearch,
  useProfilesRaw,
  useTaskSearch,
} from "@/hooks/use-crm-data";
import {
  cardDescKey,
  cardTitleKey,
  useAdminCatalog,
  type CatalogItem,
} from "@/components/admin/AdminCatalog";

// Search across the platform -- pages and their sections, settings, admin
// cards, funnels, leads, tasks, people and the guides -- in one card in
// the middle of the screen (the search button under the logo, or ⌘K). The
// results live inside the same card as the field, so nothing hangs loose
// below it. Who's signed in, the theme and the language are in the avatar
// menu at the bottom of the sidebar.

type Result = SearchResult;

export type SearchResult = {
  key: string;
  group:
    "pages" | "sections" | "settings" | "admin" | "funnels" | "leads" | "tasks" | "people" | "help";
  icon: LucideIcon;
  /** Tile colour; pages use their sidebar colour. */
  tone?: CardTone | undefined;
  label: string;
  hint?: string | undefined;
  go: () => void;
};

type PaletteProps = {
  open: boolean;
  onClose: () => void;
  /** What was typed before it opened (the logo panel's search field). */
  initialQuery?: string;
};

// Mounted only while open, so its lists (admin cards, people, funnels) load
// only when someone searches.
export function SearchPalette(props: PaletteProps) {
  return props.open ? <PaletteBody {...props} /> : null;
}

// Sub-pages anyone can jump to: Bosh sahifa's tabs, Telefon's sections,
// Inbox's tabs (labels are their i18n keys).
const HOME_TAB_KEYS = [
  "desk",
  "overview",
  "rating",
  "conversion",
  "activity",
  "ai",
  "forecast",
  "finance",
];
const PHONE_SECTION_KEYS = [
  "dial",
  "log",
  "calls",
  "reports",
  "operators",
  "auto",
  "voice",
  "rating",
];

function AdminCatalogFeed({ onItems }: { onItems: (items: CatalogItem[]) => void }) {
  const groups = useAdminCatalog();
  const flat = groups.flatMap((g) => g.items);
  const sig = flat.map((i) => i.key).join(",");
  useEffect(() => onItems(flat), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Everything the platform search finds for `query` (pages, their sections,
 * settings, admin cards, funnels, leads, tasks, people, guides), grouped.
 * Shared by the ⌘K card and the logo bar's live search. `feed` must be
 * rendered (it loads the admin cards for admins).
 */
export function useSearchResults(query: string, open: boolean, onClose: () => void) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const crmEnabled = useCrmEnabled();
  const role = appRoleOf(user);
  const isPlatformOwner = user?.role === "platform_owner";
  const { data: leads = [], isFetching } = useGlobalLeadSearch(query, open);
  const { data: tasks = [] } = useTaskSearch(query, open);
  const { names: funnelNames } = useFunnelNames();
  const { data: profiles = [] } = useProfilesRaw();
  const [adminItems, setAdminItems] = useState<CatalogItem[]>([]);
  const isAdmin = user?.role === "super_admin";
  const seesPeople = isAdmin || user?.role === "rop";
  const [articles, setArticles] = useState<{ slug: string; title: string; summary: string }[]>([]);
  const { lang } = useI18n();
  useEffect(() => {
    let alive = true;
    void import("@/lib/help/articles").then((m) => {
      if (!alive) return;
      setArticles(
        m.HELP_ARTICLES.map((a) => ({
          slug: a.slug,
          title: m.pick(a.title, lang),
          summary: m.pick(a.summary, lang),
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  const go = (to: string, search?: Record<string, string>) => {
    onClose();
    void navigate({ to, ...(search ? { search } : {}) } as never);
  };

  const { rules: accessRules } = useAccessRules();
  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const pages = isPlatformOwner
      ? NAV_ITEMS.filter((i) => i.platformOwnerOnly)
      : navItemsFor(role, crmEnabled).filter((i) => canOpenSection(accessRules, role, i.to));
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
        canOpenSection(accessRules, role, c.to) &&
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
    const pageName = (to: string) => t(`nav.${to}`);
    const sectionResults: Result[] = isPlatformOwner
      ? []
      : [
          ...(canOpenPath(role, "/", crmEnabled)
            ? HOME_TAB_KEYS.map((k) => ({
                key: `sec-home-${k}`,
                to: "/",
                search: { tab: k },
                label: t(`home.tab.${k}`),
                parent: pageName("/"),
              }))
            : []),
          ...(canOpenPath(role, "/phone", crmEnabled)
            ? PHONE_SECTION_KEYS.map((k) => ({
                key: `sec-phone-${k}`,
                to: "/phone",
                search: { s: k },
                label: t(`ptel.s.${k}`),
                parent: pageName("/phone"),
              }))
            : []),
        ]
          .filter((x) => catalogMatches(`${x.label} ${x.parent}`, q))
          .slice(0, 8)
          .map((x) => ({
            key: x.key,
            group: "sections" as const,
            icon: ArrowRight,
            label: x.label,
            hint: x.parent,
            go: () => go(x.to, x.search),
          }));
    const adminResults: Result[] = adminItems
      .filter((i) => catalogMatches(`${t(cardTitleKey(i))} ${t(cardDescKey(i))}`, q))
      .slice(0, 8)
      .map((i) => ({
        key: `a-${i.key}`,
        group: "admin",
        icon: i.icon,
        tone: i.tone,
        label: t(cardTitleKey(i)),
        hint: t(cardDescKey(i)),
        go: () => go(i.to, i.search),
      }));
    const funnelResults: Result[] = crmEnabled
      ? funnelNames
          .filter((f) => catalogMatches(f, q))
          .slice(0, 6)
          .map((f) => ({
            key: `f-${f}`,
            group: "funnels",
            icon: Workflow,
            tone: "violet",
            label: f,
            hint: pageName("/funnels"),
            go: () => go("/funnels", { funnel: f }),
          }))
      : [];
    const peopleResults: Result[] = seesPeople
      ? profiles
          .filter(
            (p) =>
              p.role !== "platform_owner" &&
              catalogMatches(`${p.full_name ?? ""} ${p.email ?? ""} ${p.phone ?? ""}`, q),
          )
          .slice(0, 6)
          .map((p) => ({
            key: `u-${p.id}`,
            group: "people",
            icon: Users,
            tone: "sky",
            label: p.full_name || p.email || "—",
            hint: [p.email, p.phone].filter(Boolean).join(" · "),
            go: () => go(isAdmin ? "/admin/employees" : "/attendance"),
          }))
      : [];
    const taskResults: Result[] = tasks
      .filter((x) => !!x.lead_id)
      .map((x) => ({
        key: `t-${x.id}`,
        group: "tasks",
        icon: ListChecks,
        tone: "amber",
        label: x.title,
        hint: x.due_date ? new Date(x.due_date).toLocaleDateString() : undefined,
        go: () => {
          onClose();
          void navigate({
            to: "/crm/leads/$leadId",
            params: { leadId: x.lead_id! },
            search: { from: "funnels" },
          });
        },
      }));
    const helpResults: Result[] = articles
      .filter((a) => catalogMatches(`${a.title} ${a.summary}`, q))
      .slice(0, 5)
      .map((a) => ({
        key: `h-${a.slug}`,
        group: "help",
        icon: BookOpen,
        tone: "emerald",
        label: a.title,
        hint: a.summary,
        go: () => go(`/help/${a.slug}`),
      }));
    return [
      ...pageResults,
      ...sectionResults,
      ...settingResults,
      ...adminResults,
      ...funnelResults,
      ...leadResults,
      ...taskResults,
      ...peopleResults,
      ...helpResults,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    leads,
    tasks,
    adminItems,
    funnelNames,
    profiles,
    articles,
    role,
    crmEnabled,
    isPlatformOwner,
    t,
    accessRules,
  ]);

  const groups: { key: Result["group"]; label: string }[] = [
    { key: "pages", label: query.trim() ? t("accountBar.pages") : t("accountBar.quick") },
    { key: "sections", label: t("search.g.sections") },
    { key: "settings", label: t("accountBar.settings") },
    { key: "admin", label: t("search.g.admin") },
    { key: "funnels", label: t("search.g.funnels") },
    { key: "leads", label: t("accountBar.leads") },
    { key: "tasks", label: t("search.g.tasks") },
    { key: "people", label: t("search.g.people") },
    { key: "help", label: t("search.g.help") },
  ];
  return {
    results,
    groups,
    isFetching,
    feed: isAdmin ? <AdminCatalogFeed onItems={setAdminItems} /> : null,
  };
}

function PaletteBody({ open, onClose, initialQuery = "" }: PaletteProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { results, groups, isFetching, feed } = useSearchResults(query, open, onClose);
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, initialQuery]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const searching = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      {feed}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-in fade-in-0"
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

        <SearchResultList
          listRef={listRef}
          results={results}
          groups={groups}
          active={active}
          onActive={setActive}
          searching={searching}
          isFetching={isFetching}
          className="min-h-0 flex-1 overflow-y-auto p-2"
        />

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

/** The grouped results (the ⌘K card and the logo bar's dropdown). */
export function SearchResultList({
  listRef,
  results,
  groups,
  active,
  onActive,
  searching,
  isFetching,
  className,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  results: SearchResult[];
  groups: { key: SearchResult["group"]; label: string }[];
  active: number;
  onActive: (i: number) => void;
  searching: boolean;
  isFetching: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div ref={listRef} className={className}>
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
                  onMouseMove={() => onActive(idx)}
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
        <p className="px-3 py-10 text-center text-[13px] text-subtle">{t("accountBar.nothing")}</p>
      )}
      {searching && isFetching && (
        <p className="px-3 py-2 text-[12px] text-subtle">{t("common.loading")}</p>
      )}
    </div>
  );
}
