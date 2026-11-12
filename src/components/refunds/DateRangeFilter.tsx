import { useState } from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// A compact date filter: one button showing the chosen range ("Sana:
// barchasi", "Bugun", "01.11 – 12.11"), opening quick ranges and two date
// fields. Dates are YYYY-MM-DD in the company's (Tashkent) calendar.

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Quick = "today" | "yesterday" | "d7" | "d30" | "month" | "lastMonth";
const QUICK: Quick[] = ["today", "yesterday", "d7", "d30", "month", "lastMonth"];

function quickRange(q: Quick, now = new Date()): { from: string; to: string } {
  const d = new Date(now);
  const today = ymd(d);
  if (q === "today") return { from: today, to: today };
  if (q === "yesterday") {
    d.setDate(d.getDate() - 1);
    return { from: ymd(d), to: ymd(d) };
  }
  if (q === "d7" || q === "d30") {
    d.setDate(d.getDate() - (q === "d7" ? 6 : 29));
    return { from: ymd(d), to: today };
  }
  if (q === "month") return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
  return {
    from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)),
  };
}

const short = (v: string) => v.slice(8, 10) + "." + v.slice(5, 7);

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const active = !!(from || to);
  const quick = QUICK.find((q) => {
    const r = quickRange(q);
    return r.from === from && r.to === to;
  });
  const label = !active
    ? t("refund.fAll")
    : quick
      ? t(`refund.q.${quick}`)
      : from === to
        ? short(from)
        : `${from ? short(from) : "…"} – ${to ? short(to) : "…"}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13.5px] transition-colors",
            active
              ? "border-primary/50 bg-primary/5 text-foreground"
              : "border-border bg-card hover:border-primary/30",
          )}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{t("refund.fDate")}:</span>
          <span className="font-semibold tabular-nums">{label}</span>
          {active ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("refund.fReset")}
              onClick={(e) => {
                e.stopPropagation();
                onChange("", "");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  onChange("", "");
                }
              }}
              className="-mr-1 grid h-5 w-5 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[290px] rounded-2xl p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                const r = quickRange(q);
                onChange(r.from, r.to);
                setOpen(false);
              }}
              className={cn(
                "h-9 rounded-lg border text-[13px] font-medium transition-colors",
                quick === q
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40",
              )}
            >
              {t(`refund.q.${q}`)}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          {(["from", "to"] as const).map((k) => (
            <label key={k} className="text-[11.5px] font-semibold uppercase text-subtle">
              {t(k === "from" ? "an.from" : "an.to")}
              <input
                type="date"
                value={k === "from" ? from : to}
                min={k === "to" ? from || undefined : undefined}
                max={k === "from" ? to || undefined : undefined}
                onChange={(e) =>
                  k === "from" ? onChange(e.target.value, to) : onChange(from, e.target.value)
                }
                className="mt-1 h-9 w-full rounded-lg border border-border bg-input px-2 text-[13px] font-normal normal-case text-foreground outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
