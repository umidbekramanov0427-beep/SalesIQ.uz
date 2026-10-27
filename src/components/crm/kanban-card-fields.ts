import { stamp } from "@/components/lead/amo-utils";
import type { CrmLeadView } from "@/hooks/use-crm-data";
import { fieldValueText } from "@/lib/lead-field-types";

// What a funnel card's configurable slots show: a field's label (for the
// settings dialog) and its text for one lead.

type T = (k: string, vars?: Record<string, string | number>) => string;

export type CardCtx = {
  t: T;
  format: (n: number) => string;
  canViewRevenue: boolean;
  customLabels: Record<string, string>;
  /** Field type per custom key, so dates and lists read right. */
  customTypes?: Record<string, string>;
};

export function cardFieldLabel(id: string, ctx: Pick<CardCtx, "t" | "customLabels">): string {
  if (id.startsWith("custom:")) return ctx.customLabels[id.slice(7)] ?? id.slice(7);
  return ctx.t(`pipeline.cardField.${id}`);
}

// "105 Dasturlash | Umidjon" -> "DU": letters only, first two words.
export function initialsOf(name: string): string {
  const words = name.match(/\p{L}+/gu) ?? [];
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function shortDate(iso: string, t: T): string {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date();
  yest.setDate(now.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (same(d, now)) return `${t("amo.today")} ${time}`;
  if (same(d, yest)) return `${t("amo.yesterday")} ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// The text a field shows on a card, "" when the lead has nothing there
// (or the viewer may not see money).
export function cardFieldValue(l: CrmLeadView, id: string, ctx: CardCtx): string {
  const { t } = ctx;
  if (id.startsWith("custom:")) {
    const key = id.slice(7);
    return fieldValueText(
      ctx.customTypes?.[key] ?? "text",
      l.customFields[key],
      t("pipeline.cardYes"),
    );
  }
  switch (id) {
    case "name":
      return l.name;
    case "owner":
      return l.owner === "Unassigned" ? "" : l.owner;
    case "amount":
      return ctx.canViewRevenue && l.expectedRevenue ? ctx.format(l.expectedRevenue) : "";
    case "budget":
      return ctx.canViewRevenue && l.budget ? ctx.format(l.budget) : "";
    case "temperature":
      return l.temperature ? t(`la.temp${l.temperature}`) : "";
    case "priority":
      return l.priority ? t(`amo.priority.${l.priority}`) : "";
    case "created":
      return shortDate(l.createdAtIso, t);
    case "nextFollowUp":
      return l.nextFollowUpIso ? stamp(l.nextFollowUpIso, t) : "";
    case "amocrmId":
      return l.amocrmId ? `#${l.amocrmId}` : "";
    case "source":
    case "campaign":
    case "utm":
    case "contactName":
    case "phone":
    case "altPhone":
    case "email":
    case "telegram":
    case "position":
    case "company":
      return l[id] ?? "";
    default:
      return "";
  }
}
