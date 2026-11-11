import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Code2,
  CreditCard,
  LayoutGrid,
  MessagesSquare,
  Phone,
  Search,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  CardPicture,
  cardDescKey,
  cardTitleKey,
  type CatalogItem,
} from "@/components/admin/AdminCatalog";
import {
  CATEGORY_ORDER,
  filterMarket,
  isInstalled,
  marketCategory,
  type MarketCategory,
  type Shelf,
} from "@/lib/integrations-market";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The integrations as a store shelf (in the spirit of amoMarket): a search
// box, categories down the side with "O'rnatilgan" first, and one tile per
// service with its own big logo. Every tile opens the service's page; the
// connections map stays the other view of the same list.

const CATEGORY_ICON: Record<MarketCategory, LucideIcon> = {
  crm: Workflow,
  messengers: MessagesSquare,
  telephony: Phone,
  payments: CreditCard,
  notify: Bell,
  dev: Code2,
};

export function IntegrationsMarket({ items }: { items: CatalogItem[] }) {
  const { t } = useI18n();
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");
  const onShelf = useMemo(() => items.filter((it) => marketCategory(it.key)), [items]);
  const text = (it: CatalogItem) =>
    `${t(cardTitleKey(it))} ${t(cardDescKey(it))} ${t(`market.cat.${marketCategory(it.key)}`)}`;
  const shown = filterMarket(onShelf, shelf, query, text);
  const installed = onShelf.filter(isInstalled).length;
  const count = (s: Shelf) => filterMarket(onShelf, s, "", text).length;

  const shelves: { key: Shelf; icon: LucideIcon }[] = [
    { key: "all", icon: LayoutGrid },
    { key: "installed", icon: BadgeCheck },
    ...CATEGORY_ORDER.filter((c) => count(c) > 0).map((c) => ({
      key: c as Shelf,
      icon: CATEGORY_ICON[c],
    })),
  ];
  const shelfLabel = (s: Shelf) =>
    s === "all"
      ? t("market.all")
      : s === "installed"
        ? t("market.installed")
        : t(`market.cat.${s}`);

  // "Hammasi" without a search reads as the store's shelves, one heading
  // per category; any other view is one flat grid.
  const sections: { key: string; title: string | null; items: CatalogItem[] }[] =
    shelf === "all" && !query.trim()
      ? CATEGORY_ORDER.map((c) => ({
          key: c,
          title: t(`market.cat.${c}`),
          items: shown.filter((it) => marketCategory(it.key) === c),
        })).filter((s) => s.items.length > 0)
      : [{ key: "flat", title: null, items: shown }];

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] phone:gap-4">
      {/* Categories: a column on the side, one sideways row on phones. */}
      <nav aria-label={t("market.categories")} className="min-w-0">
        <div className="lg:sticky lg:top-4">
          <p className="console-caption mb-2.5 px-2 phone:hidden">{t("market.categories")}</p>
          <ul className="phone-tabs flex flex-col gap-0.5 max-lg:flex-row max-lg:flex-wrap max-lg:gap-1.5">
            {shelves.map(({ key, icon: Icon }) => {
              const on = shelf === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setShelf(key)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors max-lg:border max-lg:border-border max-lg:py-1.5",
                      on
                        ? "bg-primary/10 font-semibold text-foreground max-lg:border-primary/40"
                        : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", on && "text-primary")} />
                    <span className="min-w-0 flex-1 truncate">{shelfLabel(key)}</span>
                    <span
                      className={cn(
                        "font-mono text-[11px] tabular-nums",
                        on ? "text-primary" : "text-subtle",
                      )}
                    >
                      {count(key)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("market.search")}
              className="h-11 w-full rounded-xl border border-border bg-input pl-10 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary"
            />
          </label>
          <p className="font-mono text-[12.5px] text-muted-foreground">
            {t("market.summary", { total: onShelf.length })} ·{" "}
            <span className="text-primary">{t("market.summaryOn", { count: installed })}</span>
          </p>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-foreground">
              {shelf === "installed" && !query.trim()
                ? t("market.noneInstalled")
                : t("hub.nothingFound")}
            </p>
            {shelf === "installed" && !query.trim() && (
              <button
                type="button"
                onClick={() => setShelf("all")}
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
              >
                {t("market.browseAll")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((s) => (
              <section key={s.key}>
                {s.title && (
                  <div className="mb-3 flex items-baseline gap-2">
                    <h2 className="console-caption">{s.title}</h2>
                    <span className="console-caption opacity-70">· {s.items.length}</span>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {s.items.map((it) => (
                    <MarketTile key={it.key} item={it} showCategory={!s.title} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketTile({ item, showCategory }: { item: CatalogItem; showCategory: boolean }) {
  const { t } = useI18n();
  const installed = isInstalled(item);
  const category = marketCategory(item.key);
  const action = installed
    ? t("market.manage")
    : item.status?.connection
      ? t("console.connect")
      : t("console.open");
  return (
    <Link
      to={item.to}
      search={(item.search ?? {}) as never}
      data-live={installed || undefined}
      className={cn(
        "market-tile admin-card group flex min-h-[188px] flex-col rounded-2xl border bg-card p-5 transition-[border-color,box-shadow,translate] duration-300 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        installed
          ? "border-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_12%,transparent),0_14px_34px_-22px_var(--console-glow,transparent)]"
          : "border-border hover:border-foreground/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <CardPicture item={item} size="lg" />
        {installed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[11.5px] font-semibold text-primary">
            <BadgeCheck className="h-3.5 w-3.5" />
            {t("market.installedOne")}
          </span>
        ) : item.status?.connection ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
            {t("console.notConnected")}
          </span>
        ) : null}
      </div>
      <h3 className="mt-4 text-[16px] font-semibold leading-snug text-foreground">
        {t(cardTitleKey(item))}
      </h3>
      {showCategory && category && (
        <p className="console-caption mt-1 !text-[10.5px]">{t(`market.cat.${category}`)}</p>
      )}
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
        {t(cardDescKey(item))}
      </p>
      <span
        className={cn(
          "mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold transition-colors",
          installed ? "text-foreground" : "text-primary",
        )}
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
