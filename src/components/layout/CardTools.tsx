import type { ReactNode } from "react";
import { InfoTip } from "@/components/layout/InfoTip";
import { keysForText, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The "!" in a figure card's corner: what it is, how it's counted, what to
// do (InfoTip). Every figure card -- StatCard, the owner panel's, the
// marketing and refunds ones -- uses it, so they behave alike.

export type CardChrome = {
  /** The written explainers to look for, in order. */
  keys: string[];
};

/** Which explainer a card shows, from its name (its i18n key when known). */
export function useCardChrome({
  tipKey,
  label,
}: {
  tipKey?: string | undefined;
  label: string;
}): CardChrome {
  const { lang } = useI18n();
  return { keys: tipKey ? [tipKey] : keysForText(lang, label) };
}

/** The card's own controls and its "!", for the card's top corner. */
export function CardTools({
  chrome,
  label,
  text,
  className,
  extra,
}: {
  /** The card's own controls, shown before the "!". */
  extra?: ReactNode;
  chrome: CardChrome;
  label: string;
  /** The card's own explanation, when no written explainer matches. */
  text?: string | undefined;
  className?: string | undefined;
}) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {extra}
      <InfoTip
        tipKeys={chrome.keys}
        text={text ?? t("info.fallback", { name: label })}
        title={label}
      />
    </span>
  );
}
