import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calculator, Hand, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { loadTips, pickTip, useTips } from "@/lib/help/tips-loader";
import { cn } from "@/lib/utils";

// The "!" beside every card, figure, page title and menu item. Hover (or a
// tap on a phone) opens a small panel: what this is, how its figure is
// worked out and what can be done here -- from the explainers in
// lib/help/tips.ts when one is written for it (`tipKeys`), else the text
// the element already carries (its description).

export function InfoTip({
  text,
  tipKeys,
  title,
  className,
  size = "sm",
  side = "top",
  footer,
}: {
  /** Shown when no written explainer matches. */
  text?: string | undefined;
  /** Explainer keys to try, in order (an i18n key, "nav:/path", "page:/path"). */
  tipKeys?: (string | null | undefined)[];
  title?: string | undefined;
  className?: string | undefined;
  size?: "sm" | "md";
  side?: "top" | "right" | "bottom" | "left";
  /** Extra line at the bottom (a link to the page's guide...). */
  footer?: ReactNode | undefined;
}) {
  const { t, lang } = useI18n();
  const tips = useTips();
  const [open, setOpen] = useState(false);
  const closer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tip = pickTip(tips, tipKeys ?? []);
  useEffect(() => () => void (closer.current && clearTimeout(closer.current)), []);

  const show = () => {
    if (closer.current) clearTimeout(closer.current);
    void loadTips();
    setOpen(true);
  };
  const hide = () => {
    if (closer.current) clearTimeout(closer.current);
    closer.current = setTimeout(() => setOpen(false), 140);
  };
  const label = tip?.what[lang] ?? text ?? title ?? "";
  if (!tip && !text) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void loadTips();
            setOpen((o) => !o);
          }}
          className={cn(
            "info-tip inline-flex shrink-0 cursor-help items-center justify-center rounded-full border font-bold leading-none outline-none transition-colors",
            size === "md" ? "h-[18px] w-[18px] text-[11px]" : "h-3.5 w-3.5 text-[9px]",
            open
              ? "border-primary bg-primary/10 text-primary"
              : "border-subtle/60 text-subtle hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary",
            className,
          )}
        >
          !
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={6}
        onMouseEnter={show}
        onMouseLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        className="z-[80] w-[300px] space-y-2.5 p-3.5 text-[12.5px] leading-relaxed"
      >
        <p className="flex items-start gap-2 font-semibold text-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0">{title ?? t("tipbox.title")}</span>
        </p>
        <p className="text-muted-foreground">{label}</p>
        {tip?.calc && (
          <Section icon={Calculator} title={t("tipbox.calc")}>
            {tip.calc[lang]}
          </Section>
        )}
        {tip?.act && (
          <Section icon={Hand} title={t("tipbox.act")}>
            {tip.act[lang]}
          </Section>
        )}
        {footer && <div className="border-t border-border/70 pt-2">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Info;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-foreground/[0.025] px-2.5 py-2">
      <p className="mb-0.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-subtle">
        <Icon className="h-3 w-3" />
        {title}
      </p>
      <p className="text-foreground/90">{children}</p>
    </div>
  );
}
