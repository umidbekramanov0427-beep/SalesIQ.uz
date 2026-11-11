// Lead colouring (amoCRM's "цветные сделки"): a company sets rules like
// "no task -> red", "tag VIP -> violet", "over 5 days in the stage ->
// amber", and the funnel board paints each lead's card with the first rule
// it matches. The rules live in org_general_settings.kanban_card_fields
// .colorRules (next to the card layouts), so no schema change was needed.

export const LEAD_COLOR_KEYS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "violet",
  "pink",
  "gray",
] as const;
export type LeadColorKey = (typeof LEAD_COLOR_KEYS)[number];

export const LEAD_COLOR_CONDITIONS = [
  "noTask",
  "overdueTask",
  "tag",
  "source",
  "amountAtLeast",
  "daysInStage",
  "noContactDays",
  "temperature",
  "priority",
  "customField",
] as const;
export type LeadColorConditionKind = (typeof LEAD_COLOR_CONDITIONS)[number];

/** Conditions that need a value next to them, and what kind. */
export const CONDITION_VALUE: Record<
  LeadColorConditionKind,
  "none" | "text" | "number" | "temperature" | "priority" | "field"
> = {
  noTask: "none",
  overdueTask: "none",
  tag: "text",
  source: "text",
  amountAtLeast: "number",
  daysInStage: "number",
  noContactDays: "number",
  temperature: "temperature",
  priority: "priority",
  customField: "field",
};

export const TEMPERATURES = ["VeryHot", "Hot", "Warm", "Cold"] as const;
export const PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;

/** Every funnel. */
export const ALL_FUNNELS = "*";

export type LeadColorRule = {
  id: string;
  kind: LeadColorConditionKind;
  /** The tag, source, amount, days, temperature, priority or field value. */
  value: string;
  /** customField only: the field's key. */
  field?: string | undefined;
  color: LeadColorKey;
  /** A funnel's name, or ALL_FUNNELS. */
  funnel: string;
  enabled: boolean;
};

/** The few lead fields the rules read (CrmLeadView has them all). */
export type ColorableLead = {
  nextFollowUpIso: string | null;
  tags: string[];
  source: string;
  expectedRevenue: number;
  budget: number;
  stageChangedAtIso: string | null;
  createdAtIso: string;
  lastContactIso: string | null;
  temperature: string;
  priority: string;
  stageIsWon: boolean;
  stageIsLost: boolean;
  customFields: Record<string, unknown>;
};

const isKind = (v: unknown): v is LeadColorConditionKind =>
  typeof v === "string" && (LEAD_COLOR_CONDITIONS as readonly string[]).includes(v);
const isColor = (v: unknown): v is LeadColorKey =>
  typeof v === "string" && (LEAD_COLOR_KEYS as readonly string[]).includes(v);

/** The saved rules, dropping anything malformed (old or hand-edited data). */
export function parseLeadColorRules(kanbanCardFields: unknown): LeadColorRule[] {
  const raw =
    kanbanCardFields && typeof kanbanCardFields === "object"
      ? (kanbanCardFields as Record<string, unknown>)["colorRules"]
      : undefined;
  if (!Array.isArray(raw)) return [];
  const out: LeadColorRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o["id"] !== "string" || !isKind(o["kind"]) || !isColor(o["color"])) continue;
    out.push({
      id: o["id"],
      kind: o["kind"],
      value: typeof o["value"] === "string" ? o["value"] : "",
      field: typeof o["field"] === "string" ? o["field"] : undefined,
      color: o["color"],
      funnel: typeof o["funnel"] === "string" && o["funnel"] ? o["funnel"] : ALL_FUNNELS,
      enabled: o["enabled"] !== false,
    });
  }
  return out;
}

/** kanban_card_fields with the rules written in, other keys kept. */
export function withLeadColorRules(
  kanbanCardFields: unknown,
  rules: LeadColorRule[],
): Record<string, unknown> {
  const current =
    kanbanCardFields && typeof kanbanCardFields === "object"
      ? (kanbanCardFields as Record<string, unknown>)
      : {};
  return { ...current, colorRules: rules };
}

const DAY = 86_400_000;
const norm = (s: string) => s.trim().toLowerCase();

/** Whether one rule's condition holds for the lead (ignores funnel and on/off). */
export function ruleMatches(rule: LeadColorRule, lead: ColorableLead, now: number): boolean {
  const closed = lead.stageIsWon || lead.stageIsLost;
  const n = Number(rule.value);
  switch (rule.kind) {
    case "noTask":
      return !closed && !lead.nextFollowUpIso;
    case "overdueTask":
      return !closed && !!lead.nextFollowUpIso && new Date(lead.nextFollowUpIso).getTime() < now;
    case "tag":
      return !!norm(rule.value) && lead.tags.some((t) => norm(t) === norm(rule.value));
    case "source":
      return !!norm(rule.value) && norm(lead.source) === norm(rule.value);
    case "amountAtLeast":
      return (
        rule.value.trim() !== "" &&
        Number.isFinite(n) &&
        Math.max(lead.expectedRevenue || 0, lead.budget || 0) >= n
      );
    case "daysInStage": {
      if (closed || !Number.isFinite(n) || n <= 0) return false;
      const since = new Date(lead.stageChangedAtIso ?? lead.createdAtIso).getTime();
      return now - since >= n * DAY;
    }
    case "noContactDays": {
      if (closed || !Number.isFinite(n) || n <= 0) return false;
      const since = new Date(lead.lastContactIso ?? lead.createdAtIso).getTime();
      return now - since >= n * DAY;
    }
    case "temperature":
      return lead.temperature === rule.value;
    case "priority":
      return lead.priority === rule.value;
    case "customField": {
      if (!rule.field || !norm(rule.value)) return false;
      const v = lead.customFields[rule.field];
      const values = Array.isArray(v) ? v : [v];
      return values.some(
        (x) => x !== null && x !== undefined && norm(String(x)) === norm(rule.value),
      );
    }
  }
}

/** The colour of the first enabled rule for this funnel the lead matches. */
export function leadColor(
  lead: ColorableLead,
  rules: LeadColorRule[],
  funnel: string,
  now: number,
): LeadColorKey | null {
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.funnel !== ALL_FUNNELS && r.funnel !== funnel) continue;
    if (ruleMatches(r, lead, now)) return r.color;
  }
  return null;
}

// The painted card: a stripe down the left edge and a light wash of the
// colour over the card's own background (.lead-tint in styles.css).
export const LEAD_COLOR_CARD: Record<LeadColorKey, string> = {
  red: "lead-tint lead-tint-red",
  orange: "lead-tint lead-tint-orange",
  amber: "lead-tint lead-tint-amber",
  green: "lead-tint lead-tint-green",
  teal: "lead-tint lead-tint-teal",
  sky: "lead-tint lead-tint-sky",
  violet: "lead-tint lead-tint-violet",
  pink: "lead-tint lead-tint-pink",
  gray: "lead-tint lead-tint-gray",
};

/** The swatch in the rules editor and the dot in the lead list. */
export const LEAD_COLOR_DOT: Record<LeadColorKey, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  gray: "bg-slate-400",
};
