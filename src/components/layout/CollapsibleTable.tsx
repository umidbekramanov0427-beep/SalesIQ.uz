import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// A report table that stays short on the card: when it is taller than
// `maxHeight` only its top shows (with a soft fade) and a "Batafsil"
// button opens the whole table in a wide window. Short tables are left as
// they are. The same idea as ListCard, for tables.

export function CollapsibleTable({
  children,
  title,
  minWidth = 640,
  maxHeight = 320,
  className,
}: {
  /** The table's head and body (thead / tbody). */
  children: ReactNode;
  /** The window's title. */
  title?: string;
  minWidth?: number;
  maxHeight?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const check = () => setTall(el.scrollHeight > maxHeight + 40);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  const table = (
    <table className="w-full border-collapse" style={{ minWidth }}>
      {children}
    </table>
  );

  return (
    <div className={className}>
      <div
        ref={ref}
        className={cn("relative -mx-1 overflow-x-auto", tall && "overflow-y-hidden")}
        style={tall ? { maxHeight } : undefined}
      >
        {table}
        {tall && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {tall && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg ctl-soft px-3 py-1.5 text-[12.5px] font-semibold text-primary"
          >
            {t("list.details")}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[88dvh] overflow-hidden sm:max-w-[min(1100px,94vw)]">
            <DialogHeader>
              <DialogTitle>{title ?? t("list.details")}</DialogTitle>
            </DialogHeader>
            <div className="-mx-1 max-h-[72dvh] overflow-auto">{table}</div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
