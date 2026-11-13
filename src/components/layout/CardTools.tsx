import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/layout/InfoTip";
import { uiSaveErrorKey, useUiSettings } from "@/hooks/crm/ui-settings";
import { keysForText, useI18n } from "@/lib/i18n";
import {
  cardId,
  cardState,
  pageKey,
  slug,
  withCardRule,
  type CardRule,
  type CardState,
} from "@/lib/ui-settings";
import { cn } from "@/lib/utils";

// The two small marks in a figure card's corner: "!" (what it is, how it's
// counted, what to do -- InfoTip) and, for the company's admins, the gear:
// a warning limit (the card turns red past it, green within) and hiding the
// card for everyone. Every figure card -- StatCard, the owner panel's,
// the marketing and refunds ones -- uses these, so they behave alike.

export type CardChrome = {
  id: string;
  keys: string[];
  rule: CardRule | undefined;
  state: CardState;
  hidden: boolean;
  canEdit: boolean;
};

/** A card's settings and state, from its name (its i18n key when known). */
export function useCardChrome({
  tipKey,
  label,
  value,
}: {
  tipKey?: string | undefined;
  label: string;
  value?: unknown;
}): CardChrome {
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { settings, canEdit } = useUiSettings();
  const keys = tipKey ? [tipKey] : keysForText(lang, label);
  const id = cardId(pageKey(pathname), tipKey ?? keys[0] ?? slug(label));
  const rule = settings.cards[id];
  return {
    id,
    keys,
    rule,
    state: cardState(rule, value),
    hidden: !!rule?.hide,
    canEdit,
  };
}

/** The card's edge in its state: red past a limit, green within. */
export function cardStateClass(state: CardState): string {
  if (state === "bad") return "!border-rose-500/60 ring-1 ring-rose-500/25";
  if (state === "good") return "!border-emerald-500/45";
  return "";
}

/** The figure's colour in its state. */
export function valueStateClass(state: CardState): string {
  return state === "bad" ? "!text-rose-600 dark:!text-rose-400" : "";
}

/** "!" and the gear, side by side, for a card's top corner. */
export function CardTools({
  chrome,
  label,
  text,
  className,
  gear = true,
  extra,
}: {
  /** false: the card has its own settings button (passed as `extra`). */
  gear?: boolean;
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
      {chrome.state === "bad" && (
        <AlertTriangle className="h-3.5 w-3.5 text-rose-500" aria-label={t("cardcfg.stateBad")} />
      )}
      {chrome.state === "good" && (
        <CheckCircle2
          className="h-3.5 w-3.5 text-emerald-500"
          aria-label={t("cardcfg.stateGood")}
        />
      )}
      {extra}
      <InfoTip
        tipKeys={chrome.keys.map((k) => k)}
        text={text ?? t("info.fallback", { name: label })}
        title={label}
      />
      {gear && chrome.canEdit && <CardGear chrome={chrome} label={label} />}
    </span>
  );
}

function CardGear({ chrome, label }: { chrome: CardChrome; label: string }) {
  const { t } = useI18n();
  const { settings, save, saving } = useUiSettings();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMin(chrome.rule?.min != null ? String(chrome.rule.min) : "");
    setMax(chrome.rule?.max != null ? String(chrome.rule.max) : "");
    setHide(!!chrome.rule?.hide);
  }, [open, chrome.rule]);

  const toNum = (v: string) => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return v.trim() && Number.isFinite(n) ? n : null;
  };

  async function commit(rule: CardRule) {
    try {
      await save(withCardRule(settings, chrome.id, rule));
      toast.success(t("common.saved"));
      setOpen(false);
    } catch (err) {
      toast.error(
        uiSaveErrorKey(err) === "pending" ? t("cardcfg.migrationPending") : t("common.saveFailed"),
      );
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("cardcfg.title")}
          title={t("cardcfg.title")}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "card-gear inline-flex h-[18px] w-[18px] items-center justify-center rounded-md text-subtle transition-colors hover:bg-accent hover:text-foreground",
            (open || chrome.rule) && "text-primary",
          )}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        className="z-[80] w-[300px] space-y-3 p-3.5"
      >
        <div>
          <p className="text-[13px] font-semibold text-foreground">{t("cardcfg.title")}</p>
          <p className="truncate text-[12px] text-muted-foreground">{label}</p>
        </div>
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-subtle">
            {t("cardcfg.limits")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11.5px] text-muted-foreground">
              {t("cardcfg.min")}
              <input
                inputMode="decimal"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="—"
                className="h-8 w-full rounded-lg border border-border bg-input px-2 text-[13px] tabular-nums text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="space-y-1 text-[11.5px] text-muted-foreground">
              {t("cardcfg.max")}
              <input
                inputMode="decimal"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                placeholder="—"
                className="h-8 w-full rounded-lg border border-border bg-input px-2 text-[13px] tabular-nums text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {t("cardcfg.limitsHint")}
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-medium text-foreground">
          <span className="flex items-center gap-2">
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            {t("cardcfg.hide")}
          </span>
          <Switch checked={hide} onCheckedChange={setHide} />
        </label>
        <p className="text-[11px] text-subtle">{t("cardcfg.forCompany")}</p>
        <div className="flex justify-between gap-2">
          <button
            type="button"
            disabled={saving || !chrome.rule}
            onClick={() => void commit({})}
            className="h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {t("cardcfg.reset")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void commit({ min: toNum(min), max: toNum(max), hide })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A hidden card: nothing for most people; for the admins who can bring it
 * back, a slim dashed placeholder with "Ko'rsatish".
 */
export function HiddenCard({
  chrome,
  label,
  className,
}: {
  chrome: CardChrome;
  label: string;
  className?: string | undefined;
}) {
  const { t } = useI18n();
  const { settings, save } = useUiSettings();
  if (!chrome.canEdit) return null;
  return (
    <div
      className={cn(
        "flex min-h-[64px] min-w-0 items-center gap-2 rounded-2xl border border-dashed border-border/80 px-3.5 py-2.5 text-[12px] text-subtle",
        className,
      )}
    >
      <EyeOff className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        onClick={() =>
          void save(withCardRule(settings, chrome.id, { ...chrome.rule, hide: false })).catch(() =>
            toast.error(t("common.saveFailed")),
          )
        }
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/10"
      >
        <Eye className="h-3.5 w-3.5" />
        {t("cardcfg.show")}
      </button>
    </div>
  );
}
