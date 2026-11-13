import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { AdminConsoleHeader, IconTile, InfoTip } from "@/components/layout/Primitives";
import { keysForText, useI18n } from "@/lib/i18n";
import { NAV_ITEMS } from "@/lib/nav";
import type { CardTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  CardTools,
  HiddenCard,
  cardStateClass,
  useCardChrome,
  valueStateClass,
} from "@/components/layout/CardTools";

// The owner panel's building blocks in the admin console's language (the
// same look as a company's Admin panel): a header with the section's
// coloured icon tile and a mono caption naming where it sits, stat tiles and
// panels with the console's hairline edge, and segmented tabs whose live
// option is lit in signal blue. Every owner page is built from these, so
// the whole panel changes together.

const TONES = {
  blue: "sky",
  green: "emerald",
  amber: "amber",
  rose: "rose",
  violet: "violet",
  slate: "slate",
} as const satisfies Record<string, CardTone>;
export type OwnerTone = keyof typeof TONES;

/** The owner menu item a path belongs to (its colour and group). */
function useOwnerSection() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV_ITEMS.filter((i) => i.platformOwnerOnly);
  const alias = pathname.startsWith("/platform/organizations")
    ? "/platform/companies"
    : pathname.startsWith("/platform/usage")
      ? "/platform/companies"
      : pathname.startsWith("/platform/visit")
        ? "/platform/sessions"
        : pathname;
  return items.find((i) => alias === i.to || alias.startsWith(i.to + "/")) ?? null;
}

export function OwnerHeader({
  icon,
  title,
  desc,
  actions,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  actions?: ReactNode;
  /** Defaults to the section's colour in the owner menu. */
  tone?: CardTone;
}) {
  const { t } = useI18n();
  const section = useOwnerSection();
  const caption = [
    t("owner.badge"),
    section?.ownerGroup ? t(`owner.group.${section.ownerGroup}`) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <AdminConsoleHeader
      icon={icon}
      tone={tone ?? (section?.tone as CardTone | undefined) ?? "primary"}
      title={title}
      description={desc}
      caption={caption}
      actions={actions}
    />
  );
}

export function OwnerStat({
  icon,
  tone,
  label,
  value,
  note,
  info,
  tipKey,
}: {
  icon: LucideIcon;
  tone: OwnerTone;
  label: string;
  value: ReactNode;
  note?: string;
  info?: string;
  /** The label's i18n key: the card's explainer and settings follow it. */
  tipKey?: string | undefined;
}) {
  const chrome = useCardChrome({
    tipKey,
    label,
    value: typeof value === "string" || typeof value === "number" ? value : undefined,
  });
  if (chrome.hidden) return <HiddenCard chrome={chrome} label={label} />;
  return (
    <div
      className={cn(
        "admin-card flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4",
        cardStateClass(chrome.state),
      )}
    >
      <div className="flex items-center gap-2.5">
        <IconTile icon={icon} tone={TONES[tone]} size="sm" />
        <span
          className="console-caption line-clamp-2 min-w-0 flex-1 !leading-[1.35] !tracking-[0.08em] [overflow-wrap:anywhere]"
          title={label}
        >
          {label}
        </span>
        <CardTools chrome={chrome} label={label} text={info} />
      </div>
      <p
        className={cn(
          "font-display text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground",
          valueStateClass(chrome.state),
        )}
      >
        {value}
      </p>
      {note && <p className="truncate font-mono text-[11.5px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export function OwnerPanel({
  title,
  info,
  actions,
  children,
  className,
  flush,
  icon,
  tone = "primary",
}: {
  title?: string;
  info?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding (tables, lists that run edge to edge). */
  flush?: boolean;
  /** A coloured icon tile beside the title. */
  icon?: LucideIcon;
  tone?: CardTone;
}) {
  const { lang } = useI18n();
  return (
    <section
      className={cn(
        "admin-card overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/15",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 px-5 py-3.5 phone:px-4">
          {icon && <IconTile icon={icon} tone={tone} size="sm" />}
          {title && (
            <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold tracking-tight text-foreground">
              <span className="truncate">{title}</span>
              <InfoTip text={info} tipKeys={keysForText(lang, title)} title={title} />
            </h2>
          )}
          {actions}
        </div>
      )}
      <div className={flush ? "" : "p-5 phone:p-4"}>{children}</div>
    </section>
  );
}

/** An empty state: icon, what will appear here, and the first action. */
export function OwnerEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <IconTile icon={icon} tone="slate" size="md" />
      <p className="mt-3 text-[14.5px] font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A small segmented switch (period, kind...): the console's tab row. */
export function OwnerSegment({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return <ConsoleTabs value={value} options={options} onChange={onChange} />;
}

/**
 * The console's tab row: a hairline track, the live tab a raised chip with
 * a signal-blue underline glow. Optional icons; scrolls sideways on phones.
 */
export function ConsoleTabs<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon; count?: number }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className="phone-tabs inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-border bg-[var(--console-tint,transparent)] p-1"
    >
      {options.map((o) => {
        const on = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors",
              size === "md" ? "h-9 px-3.5 text-[13px]" : "h-7 px-2.5 text-[12px]",
              on
                ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),inset_0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className={cn("h-3.5 w-3.5", on && "text-primary")} />}
            {o.label}
            {o.count != null && o.count > 0 && (
              <span className="rounded-full bg-primary/12 px-1.5 text-[10.5px] font-bold tabular-nums text-primary">
                {o.count}
              </span>
            )}
            {on && (
              <span
                aria-hidden
                className="absolute inset-x-2.5 -bottom-[3px] h-[2px] rounded-full bg-primary shadow-[0_0_8px_var(--console-glow,var(--primary))]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A section list down the side (settings-style tabs) in the console look. */
export function ConsoleSideTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: LucideIcon; tone?: CardTone }[];
  onChange: (v: T) => void;
}) {
  return (
    <nav className="admin-card phone-tabs flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2 lg:flex-col lg:self-start">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-3 rounded-xl px-2.5 text-left text-[13.5px] font-medium transition-colors",
              on
                ? "bg-primary/[0.08] font-semibold text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {on && (
              <span
                aria-hidden
                className="absolute -left-2 top-2.5 bottom-2.5 hidden w-[3px] rounded-r-full bg-primary shadow-[0_0_8px_var(--console-glow,var(--primary))] lg:block"
              />
            )}
            <IconTile icon={o.icon} tone={o.tone ?? "primary"} size="sm" />
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
