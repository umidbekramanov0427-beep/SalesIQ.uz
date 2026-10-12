import { createContext, useContext, type ReactNode } from "react";
import { GuideButton } from "@/components/help/GuideButton";
import { BackButton } from "@/components/layout/BackButton";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Info,
  XCircle,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Sheet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TONE_TEXT, TONE_TILE, type CardTone } from "@/lib/tones";
import { useI18n } from "@/lib/i18n";
import { useOrgAccess } from "@/lib/use-org-access";
import { downloadCsv, exportAsPdf, exportToGoogleSheets } from "@/lib/export-csv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoLoader } from "@/components/LogoLoader";
import { FitText } from "@/components/ui/fit-text";

// Settings pages (admin panel and every page it opens, integrations, the
// settings page) are read and configured, not scanned like a dashboard: they
// get roomier cards, larger headings and a clear gap from the screen's right
// edge. Everything under <SettingsLayout> picks that up from PageHeader and
// SectionCard; the rest of the platform keeps its denser layout.
const SettingsDensity = createContext(false);
// Set inside a settings SectionCard: a card nested in another card gets its
// own recessed ground and border instead of the same surface as its parent,
// where the two used to blend into one undivided block.
const InsideSectionCard = createContext(false);
export const useSettingsLayout = () => useContext(SettingsDensity);

// The admin panel's own look (admin pages and integrations): every card
// leads with a colored icon naming its subject, headings are larger, and
// state is spelled out with an icon chip -- so a page reads at a glance.
const AdminLook = createContext(false);
export const useAdminLook = () => useContext(AdminLook);

export function SettingsLayout({
  children,
  gutter = true,
  variant = "settings",
}: {
  children: ReactNode;
  // Off where the page already pads its own scroll pane (settings).
  gutter?: boolean;
  variant?: "settings" | "admin";
}) {
  return (
    <SettingsDensity.Provider value={true}>
      <AdminLook.Provider value={variant === "admin"}>
        <div className={cn("settings-scope", gutter && "lg:pr-5")}>{children}</div>
      </AdminLook.Provider>
    </SettingsDensity.Provider>
  );
}

export type { CardTone };

export function IconTile({
  icon: Icon,
  tone = "primary",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: CardTone;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        TONE_TILE[tone],
        size === "lg" && "h-[52px] w-[52px] rounded-2xl",
        size === "md" && "h-11 w-11 rounded-xl",
        size === "sm" && "h-9 w-9 rounded-lg",
      )}
    >
      <Icon
        className={size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-[18px] w-[18px]"}
      />
    </span>
  );
}

const STATUS_CHIP = {
  ok: { icon: CheckCircle2, cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  off: { icon: CircleDashed, cls: "bg-muted text-muted-foreground" },
  warn: { icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  error: { icon: XCircle, cls: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
  info: { icon: Info, cls: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
} as const;

// A state that has to be read at a glance -- connected, not connected,
// needs setup, failing -- as an icon plus a word, never color alone.
export function StatusChip({
  state,
  children,
}: {
  state: keyof typeof STATUS_CHIP;
  children: ReactNode;
}) {
  const { icon: Icon, cls } = STATUS_CHIP[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold",
        cls,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </span>
  );
}

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

// Every card, figure and setting carries a "!" (the owner asked for it
// everywhere): its own explainer when it has one, else its description,
// else a pointer to the page's guide.
function useTipText(info: string | undefined, description: unknown, name: unknown): string {
  const { t } = useI18n();
  if (info) return info;
  if (typeof description === "string" && description.trim()) return description;
  return t("info.fallback", { name: typeof name === "string" ? name : "" });
}

// A single circular, color-tinted icon action with its label on hover/focus
// instead of inline text -- originally for communication channels (call,
// WhatsApp, email, Telegram, "open in amoCRM"), now the platform's general
// row-action icon button too (edit/set password/delete, etc.), since both
// cases are the same problem: a row of identical gray icons with no color
// differentiation and no indication of which is disabled or destructive.
// One glanceable color per action, a consistent circular footprint at any
// screen size, and the label still available to anyone hovering, focusing,
// or using a screen reader.
const CHANNEL_TONES = {
  neutral: "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
  call: "bg-success/10 text-success hover:bg-success/15",
  whatsapp: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400",
  email: "bg-primary/10 text-primary hover:bg-primary/15",
  telegram: "bg-sky-500/10 text-sky-600 hover:bg-sky-500/15 dark:text-sky-400",
  destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
  warning: "bg-warning/15 text-warning-foreground hover:bg-warning/20",
} as const;

export function ChannelActionButton({
  icon: Icon,
  label,
  tone = "neutral",
  loading = false,
  disabled = false,
  onClick,
  href,
}: {
  icon: LucideIcon;
  label: string;
  tone?: keyof typeof CHANNEL_TONES;
  loading?: boolean;
  disabled?: boolean;
  // Exactly one of these normally does something; a disabled button (no
  // phone/email/handle on file) can pass neither.
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9",
        CHANNEL_TONES[tone],
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {loading ? (
        <svg className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      ) : (
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      )}
    </span>
  );
  const trigger =
    href !== undefined ? (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
        {content}
      </a>
    ) : (
      <button type="button" onClick={onClick} disabled={disabled} aria-label={label}>
        {content}
      </button>
    );
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
  tone = "primary",
  back = true,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  tone?: CardTone;
  /** false hides the "Orqaga" chip (it is on every page by default). */
  back?: boolean;
}) {
  const roomy = useContext(SettingsDensity);
  const admin = useContext(AdminLook);
  const backChip = back ? <BackButton className={admin ? "mb-5" : "mb-4"} /> : null;
  if (admin) {
    return (
      <>
        {backChip}
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {icon && <IconTile icon={icon} tone={tone} size="lg" />}
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[28px]">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground phone:line-clamp-2">
                  {description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <GuideButton />
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {backChip}
      <div
        className={cn("flex flex-wrap items-end justify-between gap-4", roomy ? "mb-6" : "mb-4")}
      >
        <div className="flex min-w-0 max-w-full items-center gap-3.5">
          {icon && <IconTile icon={icon} tone={tone} size="md" />}
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h1
              className={cn(
                "font-display font-semibold leading-tight tracking-tight text-foreground",
                roomy ? "text-xl sm:text-[26px]" : "text-lg sm:text-[22px]",
              )}
            >
              {title}
            </h1>
            {description && (
              <p
                className={cn(
                  "max-w-2xl text-muted-foreground phone:line-clamp-2",
                  roomy ? "mt-2 text-sm leading-relaxed" : "mt-1 text-xs sm:text-sm",
                )}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <GuideButton />
        </div>
      </div>
    </>
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
  icon,
  iconTone = "primary",
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  // Every tone now renders on the same neutral surface-card background —
  // no per-tone card color or accent bar, per the user's explicit "stop
  // tinting cards different colors, make them all one background" request.
  // "danger" is the one semantic exception kept: red text (not a red card)
  // for a metric that genuinely needs to read as an alert. "mint" and
  // "danger-soft" are kept as no-ops (same as "default") for prop-level
  // backwards compatibility at call sites, rather than touching every one.
  tone?: "default" | "mint" | "danger" | "danger-soft" | "hero";
  info?: string;
  // Bumps the value up a size for a card meant to read as an alert rather
  // than a routine metric.
  emphasize?: boolean;
  // Admin look: an icon tile beside the label.
  icon?: LucideIcon;
  iconTone?: CardTone;
}) {
  const isDanger = tone === "danger";
  const StatIcon = icon;
  const tip = useTipText(info, undefined, label);
  const admin = useContext(AdminLook);
  const nestedStat = useContext(InsideSectionCard);
  if (admin) {
    return (
      <div
        className={cn(
          "stat-card flex min-w-0 flex-col gap-3 rounded-2xl border p-5",
          nestedStat
            ? "border-border/70 bg-surface/60 dark:bg-white/[0.025]"
            : "border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
        )}
      >
        <div className="flex items-center gap-2.5">
          {icon && <IconTile icon={icon} tone={isDanger ? "rose" : iconTone} size="sm" />}
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{label}</span>
            <InfoTip text={tip} />
          </p>
        </div>
        <p
          className={cn(
            "font-display text-[26px] font-semibold leading-none tracking-tight tabular-nums",
            isDanger ? "text-destructive" : "text-foreground",
          )}
        >
          <FitText>{value}</FitText>
        </p>
        {(hint || delta !== undefined) && (
          <p className="text-[13px] leading-snug text-muted-foreground">
            {delta !== undefined && (
              <span
                className={cn(
                  "mr-1.5 font-semibold",
                  delta >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
            )}
            {hint}
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        // No corner-radius override any more -- a stat tile used to get a
        // sharper 6px corner than the 10px SectionCard/surface-card
        // baseline ("Hybrid shape"), which the user later found too edgy;
        // it now just inherits surface-card's own var(--radius), matching
        // every other card on the platform. surface-card also carries its
        // own ambient brand-color glow (see its definition in styles.css)
        // instead of a per-card accent bar.
        "stat-card surface-card relative overflow-hidden p-2.5 sm:p-3.5 md:p-4",
      )}
    >
      <p
        className={cn(
          // Was text-[10px]/text-xs/text-[13px] -- smaller than the delta/hint
          // row below it, so the label naming WHAT the number means read as
          // the least important thing on the card instead of the second most
          // important (after the value itself). Bumped a step up at every
          // breakpoint so it reads clearly without competing with the value.
          "flex items-center gap-1 text-xs font-bold sm:gap-1.5 sm:text-[13px] md:text-sm",
          isDanger ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {/* min-w-0 lets this shrink inside the flex row so long labels
            truncate instead of wrapping to a second line -- a wrapped
            label pushes the value down only on that one card, breaking
            the row's otherwise-even alignment with its neighbors. */}
        {StatIcon && (
          <StatIcon
            aria-hidden
            className={cn("h-4 w-4 shrink-0", TONE_TEXT[isDanger ? "rose" : iconTone])}
          />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <InfoTip text={tip} />
      </p>
      <p
        className={cn(
          "mt-1 animate-in fade-in-0 slide-in-from-bottom-1 font-display font-bold leading-none tracking-tight tabular-nums duration-500 sm:mt-2 md:mt-3",
          emphasize
            ? "text-[19px] sm:text-[26px] md:text-[38px]"
            : "text-base sm:text-[22px] md:text-[30px]",
          isDanger ? "text-destructive" : "text-foreground",
        )}
      >
        <FitText>{value}</FitText>
      </p>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 sm:mt-2.5 sm:gap-2">
        {delta !== undefined && (
          <span
            className={cn(
              // Was text-xs/sm:text-sm -- as big as or bigger than the label
              // above it, so a secondary delta pulled the eye before the
              // label did. Kept a size below the label at every breakpoint.
              "text-[11px] font-bold tabular-nums sm:text-xs",
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
              "min-w-0 text-[11px] font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-xs",
              isDanger ? "text-destructive/80" : "text-foreground/65",
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
  icon,
  tone = "primary",
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
  // The admin look's colored icon tile beside the title.
  icon?: LucideIcon;
  tone?: CardTone;
}) {
  const roomy = useContext(SettingsDensity);
  const admin = useContext(AdminLook);
  const insideCard = useContext(InsideSectionCard);
  const tip = useTipText(info, description, title);
  const nested = roomy && insideCard;
  const body = roomy ? (
    <InsideSectionCard.Provider value={true}>{children}</InsideSectionCard.Provider>
  ) : (
    children
  );
  if (admin) {
    const hasHeader = !!(title || actions);
    return (
      <section
        id={id}
        className={cn(
          nested
            ? "rounded-xl border border-border/70 bg-surface/60 dark:bg-white/[0.025]"
            : "rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
          className,
        )}
      >
        {hasHeader && (
          <header
            className={cn(
              "flex flex-wrap items-start gap-x-4 gap-y-3",
              nested ? "px-4 pt-4" : "px-5 pt-5 sm:px-6 sm:pt-6",
            )}
          >
            {icon && <IconTile icon={icon} tone={tone} size={nested ? "sm" : "md"} />}
            <div className="min-w-0 flex-1 basis-56 [overflow-wrap:anywhere]">
              {title && (
                <h2
                  className={cn(
                    "flex items-center gap-1.5 font-semibold leading-snug tracking-tight text-foreground",
                    nested ? "text-[15px]" : "text-[17px]",
                  )}
                >
                  {title}
                  <InfoTip text={tip} />
                </h2>
              )}
              {description && (
                <p
                  className={cn(
                    "mt-1 max-w-3xl leading-relaxed text-muted-foreground",
                    nested ? "text-[13px]" : "text-sm",
                  )}
                >
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </header>
        )}
        <div
          className={cn(
            nested
              ? hasHeader
                ? "px-4 pb-4 pt-3"
                : "p-4"
              : hasHeader
                ? "px-5 pb-5 pt-5 sm:px-6 sm:pb-6"
                : "p-5 sm:p-6",
          )}
        >
          {body}
        </div>
      </section>
    );
  }
  if (nested) {
    return (
      <section
        id={id}
        className={cn(
          "rounded-xl border border-border/80 bg-surface/60 dark:bg-background/60",
          className,
        )}
      >
        {(title || actions) && (
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="flex min-w-0 max-w-full items-center gap-2.5">
              {icon && <IconTile icon={icon} tone={tone} size="sm" />}
              <div className="min-w-0 [overflow-wrap:anywhere]">
                {title && (
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
                    {title}
                    <InfoTip text={tip} />
                  </h3>
                )}
                {description && (
                  <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions}
          </header>
        )}
        <div className="p-4">{body}</div>
      </section>
    );
  }
  return (
    <section id={id} className={cn("surface-card", className)}>
      {(title || actions) && (
        <header
          className={cn(
            "flex flex-wrap items-center justify-between border-b",
            roomy
              ? "gap-3 border-border/70 px-4 py-3.5 sm:px-5 sm:py-4"
              : "gap-2 border-border px-3 py-1.5",
          )}
        >
          <div className="flex min-w-0 max-w-full items-center gap-3">
            {icon && <IconTile icon={icon} tone={tone} size="sm" />}
            <div className="min-w-0 [overflow-wrap:anywhere]">
              {title && (
                <h2
                  className={cn(
                    "flex items-center gap-1.5 leading-tight text-foreground",
                    roomy ? "text-[15px] font-semibold tracking-tight" : "text-[13px] font-bold",
                  )}
                >
                  {title}
                  <InfoTip text={tip} />
                </h2>
              )}
              {description && (
                <p
                  className={cn(
                    "text-muted-foreground",
                    roomy
                      ? "mt-1 max-w-3xl text-[13px] leading-relaxed"
                      : "mt-0.5 text-xs leading-tight",
                  )}
                >
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions}
        </header>
      )}
      <div className={roomy ? "p-4 sm:p-5" : "p-2.5 sm:p-3.5"}>{body}</div>
    </section>
  );
}

// One setting per row: what it is (and what it does) on the left, its
// control on the right. Rows stack inside <SettingRows> with hairline
// dividers, so a list of switches reads as one calm block.
export function SettingRows({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tip = useTipText(undefined, description, title);
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-accent/30",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {title}
          <InfoTip text={tip} />
        </span>
        {description && (
          <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {children && <span className="shrink-0">{children}</span>}
    </label>
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
  const access = useOrgAccess();

  // Exporting is one of the things a free trial holds back -- the button
  // stays visible (so people know it exists) but explains why instead.
  if (!access.has("exports")) {
    return (
      <button
        type="button"
        onClick={() => toast.info(t("trial.exportLocked"))}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
      >
        <Lock className="h-4 w-4" /> {t("common.export")}
      </button>
    );
  }

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
