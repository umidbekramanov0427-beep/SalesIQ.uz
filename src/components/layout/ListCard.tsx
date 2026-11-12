import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { SectionCard, type CardTone } from "@/components/layout/Primitives";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// A report card that stays short: the first few rows on the card, and a
// "Batafsil" button (with the full count) that opens everything in a side
// panel -- with a search box when the list is long. Used across the
// platform for ranked lists (sources, managers, reasons, campaigns...).

export function ListCard<T>({
  icon,
  tone,
  title,
  description,
  items,
  limit = 4,
  renderRow,
  renderFull,
  searchText,
  empty,
  actions,
  className,
}: {
  icon: LucideIcon;
  tone: CardTone;
  title: string;
  description?: string;
  items: T[];
  /** Rows shown on the card itself. */
  limit?: number;
  renderRow: (item: T, index: number) => ReactNode;
  /** The side panel's body for the given (filtered) items; defaults to every row. */
  renderFull?: (items: T[]) => ReactNode;
  searchText?: (item: T) => string;
  empty?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const more = items.length > limit;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !searchText) return items;
    return items.filter((x) => searchText(x).toLowerCase().includes(s));
  }, [items, q, searchText]);

  return (
    <>
      <SectionCard
        icon={icon}
        tone={tone}
        title={title}
        {...(description ? { description } : {})}
        {...(className ? { className } : {})}
        actions={
          <div className="flex items-center gap-2">
            {actions}
            {more && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {t("list.details")}
                <span className="rounded-md bg-muted px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        }
      >
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {empty ?? t("list.empty")}
          </p>
        ) : (
          <div>
            {items.slice(0, limit).map((x, i) => renderRow(x, i))}
            {more && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {t("list.showAll", { n: items.length - limit })}
              </button>
            )}
          </div>
        )}
      </SectionCard>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[720px]">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
            )}
          </SheetHeader>
          {searchText && items.length > 8 && (
            <label className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-border bg-input px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("list.search")}
                className="h-full flex-1 bg-transparent text-[14px] outline-none"
              />
            </label>
          )}
          <div className={cn("mt-4")}>
            {renderFull ? renderFull(filtered) : filtered.map((x, i) => renderRow(x, i))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
