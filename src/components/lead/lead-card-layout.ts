import type {
  LeadCardContactKey,
  LeadCardLayout,
  LeadCardLeadKey,
  LeadCardTopKey,
} from "@/hooks/use-crm-data";

// The names the lead card's built-in rows show: the company's own name from
// the card's "Sozlamalar" tab when it set one, otherwise the default.

type T = (k: string, vars?: Record<string, string | number>) => string;

const TOP_LABEL: Record<LeadCardTopKey, string> = {
  owner: "amo.field.owner",
  budget: "amo.field.budget",
};
const LEAD_LABEL: Record<LeadCardLeadKey, string> = {
  source: "amo.field.source",
  campaign: "amo.field.campaign",
  stream: "amo.field.stream",
  priority: "amo.field.priority",
  created: "amo.field.created",
};
const CONTACT_LABEL: Record<LeadCardContactKey, string | { text: string }> = {
  company: "amo.contact.company",
  phone: "amo.contact.workPhone",
  altPhone: "amo.contact.altPhone",
  email: { text: "Email" },
  telegram: "amo.contact.telegram",
  position: "amo.contact.position",
};

export function defaultTopLabel(k: LeadCardTopKey, t: T): string {
  return t(TOP_LABEL[k]);
}
export function defaultLeadLabel(k: LeadCardLeadKey, t: T): string {
  return t(LEAD_LABEL[k]);
}
export function defaultContactLabel(k: LeadCardContactKey, t: T): string {
  const v = CONTACT_LABEL[k];
  return typeof v === "string" ? t(v) : v.text;
}

/** Keys in `layout.hidden` / `layout.labels` for the contact rows and the built-in group. */
export const contactRowKey = (k: LeadCardContactKey) => `c:${k}`;
export const groupRowKey = (id: string) => `g:${id}`;
export const fieldRowKey = (id: string) => `cf:${id}`;

export function topLabel(layout: LeadCardLayout, k: LeadCardTopKey, t: T): string {
  return layout.labels[k] ?? defaultTopLabel(k, t);
}
export function leadLabel(layout: LeadCardLayout, k: LeadCardLeadKey, t: T): string {
  return layout.labels[k] ?? defaultLeadLabel(k, t);
}
export function contactLabel(layout: LeadCardLayout, k: LeadCardContactKey, t: T): string {
  return layout.labels[contactRowKey(k)] ?? defaultContactLabel(k, t);
}
export function builtInGroupLabel(layout: LeadCardLayout, t: T): string {
  return layout.labels[groupRowKey("lead")] ?? t("amo.group.lead");
}

/** `list` with `item` moved one step up (-1) or down (1). */
export function moveItem<K>(list: K[], item: K, dir: -1 | 1): K[] {
  const i = list.indexOf(item);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * Where a built-in lead row shows: "lead" (the built-in group), a custom
 * group's id, or "none" -- a group that no longer exists falls back to
 * the built-in group.
 */
export function leadRowPlace(
  layout: LeadCardLayout,
  k: LeadCardLeadKey,
  groupIds: Set<string>,
): string {
  const p = layout.place[k];
  if (!p || p === "lead") return "lead";
  if (p === "none") return "none";
  return groupIds.has(p) ? p : "lead";
}
