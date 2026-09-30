import type { ReactNode } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { downloadCsv, exportAsPdf, exportToGoogleSheets } from "@/lib/export-csv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoLoader } from "@/components/LogoLoader";

// The same centered brand-mark loader AuthGate shows on initial app load
// (see __root.tsx), reused for a page's own "nothing to show yet" state --
// a full-width row was previously used instead (a small spinner + "Loading…"
// text), which reads as the page being stuck rather than working. Only for
// the moment a page has genuinely nothing rendered yet; a page that already
// has content and is just refreshing a section keeps its own small inline
// indicator instead of taking over the whole viewport.
export function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <LogoLoader className="h-16 w-16" />
    </div>
  );
}

// A small "!" badge that explains what a card/metric/column means on hover
// or focus -- for the label itself, not the whole surrounding card (unlike
// KpiCard's tooltip-wraps-everything pattern), so it stays out of the way
// of clicks/hovers on the card's own content.
export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={text}
            className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-subtle/60 text-[9px] font-bold leading-none text-subtle outline-none transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary"
          >
            !
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  tone = "default",
  info,
  emphasize = false,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  // "danger" is a strong alert card (red text throughout, meant to grab
  // attention). "danger-soft" only tints the background/accent bar red —
  // label/value/hint stay the same weight and color as every other card, for
  // a metric that's red-flagged but shouldn't shout louder than its
  // neighbors (e.g. Dashboard's "Yo'qotilgan summa").
  tone?: "default" | "mint" | "danger" | "danger-soft";
  info?: string;
  // Bumps the value up a size for a card meant to read as an alert rather
  // than a routine metric.
  emphasize?: boolean;
}) {
  const isDanger = tone === "danger" || tone === "danger-soft";
  return (
    <div
      className={cn(
        // A stat tile is the platform's "KPI" card -- sharper corners than
        // the 10px SectionCard/surface-card baseline (6px: the Hybrid shape
        // the user picked -- sharp for KPI tiles, soft for content cards).
        // rounded-md/shadow-card both land after surface-card/mint-card in
        // the compiled stylesheet, so they win over those utilities' own
        // radius/shadow for the tones that use them; danger/danger-soft
        // (plain bg-* tint, no shared utility) get their border from the
        // isDanger branch below instead, so this never overrides
        // mint-card's own tinted --color-mint-border edge.
        "relative overflow-hidden rounded-md p-3.5 shadow-card before:absolute before:inset-y-0 before:left-0 before:w-1.5 sm:p-4",
        // One consistent accent per state (brand blue for a routine metric,
        // success green for a "mint" card, destructive red for an alert) --
        // not a color rotated per label. A different hue on every tile in
        // the same row reads as decoration, not information; color here is
        // reserved for the one thing it actually needs to signal.
        isDanger
          ? "border border-border before:bg-destructive"
          : tone === "mint"
            ? "before:bg-success"
            : "before:bg-primary",
        tone === "mint"
          ? "mint-card"
          : tone === "danger"
            ? "bg-destructive/10"
            : tone === "danger-soft"
              ? "bg-destructive/5"
              : "surface-card",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs font-bold sm:text-[13px]",
          tone === "danger" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
        {info && <InfoTip text={info} />}
      </p>
      <p
        className={cn(
          "mt-2 animate-in fade-in-0 slide-in-from-bottom-1 truncate font-bold leading-none tracking-tight tabular-nums duration-500 sm:mt-3",
          emphasize ? "text-[26px] sm:text-[38px]" : "text-[22px] sm:text-[30px]",
          tone === "danger" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        {delta !== undefined && (
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              delta >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
        {hint && (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              tone === "danger" ? "text-destructive/80" : "text-foreground/65",
            )}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  info,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: string;
  // Same "!" hover explainer as StatCard's info prop, shown next to the
  // section title — for sections whose purpose isn't obvious from the
  // title alone.
  info?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("surface-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <div>
            {title && (
              <h2 className="flex items-center gap-1.5 text-[13px] font-bold leading-tight text-foreground">
                {title}
                {info && <InfoTip text={info} />}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{description}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "info" | "blue" | "gold";
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-mint text-mint-foreground",
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-warning/15 text-warning-foreground",
    info: "bg-primary/10 text-primary",
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

// Client-side CSV export for any data table on the platform — opens
// directly in Excel and can be imported into Google Sheets (no API
// connection required, so it works everywhere without extra setup).
export function ExportButton({
  filename,
  rows,
}: {
  filename: string;
  rows: Record<string, unknown>[];
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={rows.length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {t("common.export")}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadCsv(filename, rows)}>
          <FileSpreadsheet className="h-4 w-4" /> {t("common.exportCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAsPdf(filename, rows)}>
          <FileText className="h-4 w-4" /> {t("common.exportPdf")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            exportToGoogleSheets(filename, rows);
            toast.info(t("common.exportGoogleSheetsHint"), { duration: 8000 });
          }}
        >
          <Sheet className="h-4 w-4" /> {t("common.exportGoogleSheets")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
