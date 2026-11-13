import { InfoTip } from "@/components/layout/InfoTip";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The "!" on a menu item: what the section is for and what can be done
// there (the written explainer "nav:<path>"). Sits beside the link, never
// inside it, so a tap opens the explainer instead of the page.
export function NavTip({
  to,
  label,
  className,
  side = "right",
}: {
  to: string;
  /** The item's name (defaults to its nav.<path> text). */
  label?: string | undefined;
  className?: string | undefined;
  side?: "right" | "bottom";
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn("nav-tip z-[2] opacity-60 transition-opacity hover:opacity-100", className)}
    >
      <InfoTip tipKeys={[`nav:${to}`]} title={label ?? t(`nav.${to}`)} side={side} />
    </span>
  );
}
