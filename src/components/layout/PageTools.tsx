import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Columns3,
  Eye,
  EyeOff,
  Filter,
  LayoutGrid,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/layout/InfoTip";
import { loadTips } from "@/lib/help/tips-loader";
import { uiSaveErrorKey, useUiSettings } from "@/hooks/crm/ui-settings";
import { keysForText, useI18n, type Lang } from "@/lib/i18n";
import {
  REFRESH_OPTIONS,
  pageKey,
  slug,
  tableSignature,
  withCardRule,
  withPageRule,
  type UiSettings,
} from "@/lib/ui-settings";
import { cn } from "@/lib/utils";

// A page's "!" and gear, beside its title. The "!" says what the page is
// for and what can be done on it; the gear (the company's admins) opens the
// page's settings: auto refresh, the filters it opens with, which table
// columns show, the cards hidden or given limits here, and a link to the
// section's own settings. <PageRuntime> (in the shells) applies them.

/** Where a section's own settings live. Longest prefix wins. */
const MODULE_SETTINGS: [string, string][] = [
  ["/platform", "/platform/settings"],
  ["/marketing", "/marketing/settings"],
  ["/funnels", "/funnels/settings"],
  ["/attendance", "/admin/attendance"],
  ["/daily-report", "/daily-report-settings"],
  ["/admin", "/admin"],
  ["/integrations", "/integrations"],
  ["/", "/admin"],
];

function moduleSettingsFor(page: string): string | null {
  const hit = MODULE_SETTINGS.find(([p]) => page === p || page.startsWith(p === "/" ? "/" : p));
  if (!hit || hit[1] === page) return null;
  return hit[1];
}

export function PageTools({
  title,
  description,
  size = "md",
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  size?: "sm" | "md";
  className?: string | undefined;
}) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const page = pageKey(pathname);
  const { canEdit } = useUiSettings();
  const [open, setOpen] = useState(false);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <InfoTip
        size="md"
        side="bottom"
        tipKeys={[`page:${page}`, `nav:${page}`]}
        text={description || t("info.fallback", { name: title ?? "" })}
        title={title}
        footer={<span className="text-[11.5px] text-subtle">{t("tipbox.guideHint")}</span>}
      />
      {canEdit && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("pageset.title")}
          title={t("pageset.title")}
          className={cn(
            "page-gear inline-flex items-center justify-center rounded-lg text-subtle transition-colors hover:bg-accent hover:text-foreground",
            size === "md" ? "h-7 w-7" : "h-6 w-6",
          )}
        >
          <Settings className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </button>
      )}
      {open && <PageSettingsSheet page={page} title={title} onClose={() => setOpen(false)} />}
    </span>
  );
}

/* ---- The tables on a page and their columns ---------------------------- */

type ScannedTable = {
  el: HTMLTableElement;
  sig: string;
  cols: { key: string; label: string; index: number }[];
};

function scanTables(root: ParentNode, lang: Lang): ScannedTable[] {
  const out: ScannedTable[] = [];
  root.querySelectorAll("table").forEach((el) => {
    const headRow = el.tHead?.rows[0] ?? el.rows[0];
    if (!headRow) return;
    const cells = Array.from(headRow.cells);
    if (cells.length < 3 || !cells.some((c) => c.tagName === "TH")) return;
    const cols = cells.map((c, i) => {
      const label = (c.textContent ?? "").replace(/\s+/g, " ").trim();
      return { key: keysForText(lang, label)[0] ?? slug(label), label, index: i + 1 };
    });
    out.push({ el, sig: tableSignature(cols.map((c) => c.key)), cols });
  });
  return out;
}

let tableSeq = 0;

/**
 * Applies a page's settings: refreshes its data on the chosen interval,
 * opens it with the saved filters when it's opened without any, and hides
 * the chosen table columns.
 */
export function PageRuntime({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const page = pageKey(pathname);
  const { settings } = useUiSettings();
  const rule = settings.pages[page];

  // The explainers ("!") load once the app has settled.
  useEffect(() => {
    const id = setTimeout(() => void loadTips(), 1200);
    return () => clearTimeout(id);
  }, []);

  // Auto refresh: every query on screen, on the chosen interval, only while
  // the tab is visible.
  useEffect(() => {
    const sec = rule?.refresh ?? 0;
    if (!sec) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        void qc.invalidateQueries({ refetchType: "active" });
    }, sec * 1000);
    return () => clearInterval(id);
  }, [rule?.refresh, qc]);

  // Saved filters: once per visit, when the page opens without its own.
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (applied.current === pathname) return;
    applied.current = pathname;
    const filters = rule?.filters;
    if (!filters || (searchStr && searchStr !== "?")) return;
    router.history.replace(`${pathname}?${filters}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, rule?.filters]);

  // Hidden columns: tag each table and write one stylesheet.
  const columnsKey = JSON.stringify(rule?.columns ?? null);
  useEffect(() => {
    const root = rootRef.current;
    const hidden = rule?.columns;
    let style = document.getElementById("ui-hidden-columns") as HTMLStyleElement | null;
    if (!root || !hidden) {
      if (style) style.textContent = "";
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = "ui-hidden-columns";
      document.head.appendChild(style);
    }
    const sheet = style;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      const rules: string[] = [];
      for (const tb of scanTables(root, lang)) {
        const keys = hidden[tb.sig];
        if (!keys?.length) continue;
        if (!tb.el.dataset["uitid"]) tb.el.dataset["uitid"] = String(++tableSeq);
        for (const c of tb.cols)
          if (keys.includes(c.key))
            rules.push(
              `table[data-uitid="${tb.el.dataset["uitid"]}"] tr > :nth-child(${c.index}){display:none}`,
            );
      }
      sheet.textContent = rules.join("\n");
    };
    apply();
    const mo = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, 150);
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      if (timer) clearTimeout(timer);
      sheet.textContent = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey, pathname, lang]);

  return null;
}

/* ---- The page's settings panel ----------------------------------------- */

function PageSettingsSheet({
  page,
  title,
  onClose,
}: {
  page: string;
  title?: string | undefined;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const { settings, save } = useUiSettings();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const rule = settings.pages[page] ?? {};
  const [tables, setTables] = useState<ScannedTable[]>([]);

  useEffect(() => {
    const root = document.querySelector("[data-page-root]") ?? document.body;
    setTables(scanTables(root, lang));
  }, [lang]);

  async function commit(next: UiSettings) {
    try {
      await save(next);
    } catch (err) {
      toast.error(
        uiSaveErrorKey(err) === "pending" ? t("cardcfg.migrationPending") : t("common.saveFailed"),
      );
    }
  }

  const current = (searchStr ?? "").replace(/^\?/, "");
  const cards = Object.entries(settings.cards).filter(([id]) => id.startsWith(`${page}|`));
  const moduleLink = moduleSettingsFor(page);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            {t("pageset.title")}
          </SheetTitle>
          {title && <p className="text-[13px] text-muted-foreground">{title}</p>}
          <p className="text-[11.5px] text-subtle">{t("cardcfg.forCompany")}</p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Block icon={RefreshCw} title={t("pageset.refresh")} hint={t("pageset.refreshHint")}>
            <div className="flex flex-wrap gap-1.5">
              {REFRESH_OPTIONS.map((sec) => {
                const on = (rule.refresh ?? 0) === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => void commit(withPageRule(settings, page, { refresh: sec }))}
                    className={cn(
                      "h-8 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {sec === 0
                      ? t("pageset.off")
                      : sec < 60
                        ? t("pageset.sec", { n: sec })
                        : t("pageset.min", { n: sec / 60 })}
                  </button>
                );
              })}
            </div>
          </Block>

          <Block icon={Filter} title={t("pageset.filters")} hint={t("pageset.filtersHint")}>
            {rule.filters ? (
              <p className="break-all rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 font-mono text-[11.5px] text-foreground">
                {decodeURIComponent(rule.filters)}
              </p>
            ) : (
              <p className="text-[12px] text-subtle">{t("pageset.noFilters")}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!current}
                onClick={() => void commit(withPageRule(settings, page, { filters: current }))}
                className="h-8 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                {t("pageset.saveFilters")}
              </button>
              {rule.filters && (
                <button
                  type="button"
                  onClick={() => void commit(withPageRule(settings, page, { filters: "" }))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("pageset.clearFilters")}
                </button>
              )}
            </div>
          </Block>

          <Block icon={Columns3} title={t("pageset.columns")} hint={t("pageset.columnsHint")}>
            {tables.length === 0 && (
              <p className="text-[12px] text-subtle">{t("pageset.noTables")}</p>
            )}
            <div className="space-y-3">
              {tables.map((tb, ti) => {
                const hiddenKeys = rule.columns?.[tb.sig] ?? [];
                return (
                  <div key={`${tb.sig}-${ti}`} className="rounded-lg border border-border/70">
                    <p className="border-b border-border/70 px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-subtle">
                      {t("pageset.table", { n: ti + 1 })}
                    </p>
                    <ul className="divide-y divide-border/60">
                      {tb.cols
                        .filter((c) => c.label)
                        .map((c) => {
                          const visible = !hiddenKeys.includes(c.key);
                          return (
                            <li
                              key={c.index}
                              className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12.5px]"
                            >
                              <span className="min-w-0 truncate text-foreground">{c.label}</span>
                              <Switch
                                checked={visible}
                                onCheckedChange={(on) => {
                                  const keys = on
                                    ? hiddenKeys.filter((k) => k !== c.key)
                                    : [...hiddenKeys, c.key];
                                  const columns = { ...(rule.columns ?? {}) };
                                  if (keys.length) columns[tb.sig] = keys;
                                  else delete columns[tb.sig];
                                  void commit(withPageRule(settings, page, { columns }));
                                }}
                              />
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Block>

          <Block icon={LayoutGrid} title={t("pageset.cards")} hint={t("pageset.cardsHint")}>
            {cards.length === 0 ? (
              <p className="text-[12px] text-subtle">{t("pageset.noCards")}</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
                {cards.map(([id, r]) => {
                  const key = id.slice(page.length + 1);
                  const name = t(key) !== key ? t(key) : key;
                  return (
                    <li key={id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
                      {r.hide ? (
                        <EyeOff className="h-3.5 w-3.5 shrink-0 text-subtle" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
                      <span className="font-mono text-[11px] text-subtle">
                        {[r.min != null ? `≥ ${r.min}` : "", r.max != null ? `≤ ${r.max}` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void commit(withCardRule(settings, id, {}))}
                        className="rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-primary hover:bg-primary/10"
                      >
                        {t("cardcfg.reset")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          {moduleLink && (
            <Link
              to={moduleLink}
              onClick={onClose}
              className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              {t("pageset.module")}
              <ArrowUpRight className="h-4 w-4 text-primary" />
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Block({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Filter;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {title}
        </p>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
