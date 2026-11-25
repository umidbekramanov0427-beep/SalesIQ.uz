// Pure helpers behind the trigger form (5CRM's «Voronka triggerlari»):
// several conditions stored in the rule's one condition slot, the task
// deadline choices, «Kutish» units, the «API'ga yuborish» body and the
// «Avto yozishma» chat reader. Shared by the page and the server; tested.

export type TriggerCondition = { field: string; operator: string; value: string };

export const CONDITION_OPS = ["eq", "neq", "gt", "lt", "gte", "lte", "contains"] as const;

/** Into the rule's columns: one condition as is, several as 'multi' + JSON. */
export function conditionsToRule(list: TriggerCondition[]): {
  condition_field: string | null;
  condition_operator: string | null;
  condition_value: string | null;
} {
  const ok = list.filter((c) => c.field);
  if (ok.length === 0)
    return { condition_field: null, condition_operator: null, condition_value: null };
  if (ok.length === 1)
    return {
      condition_field: ok[0]!.field,
      condition_operator: ok[0]!.operator || "eq",
      condition_value: ok[0]!.value,
    };
  return {
    condition_field: "multi",
    condition_operator: "and",
    condition_value: JSON.stringify(
      ok.map((c) => ({ field: c.field, operator: c.operator || "eq", value: c.value })),
    ),
  };
}

export function ruleToConditions(row: {
  condition_field: string | null;
  condition_operator: string | null;
  condition_value: string | null;
}): TriggerCondition[] {
  if (!row.condition_field) return [];
  if (row.condition_field !== "multi")
    return [
      {
        field: row.condition_field,
        operator: row.condition_operator ?? "eq",
        value: row.condition_value ?? "",
      },
    ];
  try {
    const list = JSON.parse(row.condition_value ?? "[]") as TriggerCondition[];
    return Array.isArray(list)
      ? list.map((c) => ({
          field: c.field,
          operator: c.operator ?? "eq",
          value: String(c.value ?? ""),
        }))
      : [];
  } catch {
    return [];
  }
}

/** «Vazifa yaratish» deadline choices (5CRM), «Ertaga» by default. */
export const TASK_DUE = [
  "h1",
  "h2",
  "h3",
  "h4",
  "allDay",
  "tomorrow",
  "d2",
  "week",
  "custom",
] as const;
export type TaskDue = (typeof TASK_DUE)[number];

export function taskDueFields(
  d: TaskDue,
  customMinutes = 60,
): {
  dueInMinutes?: number;
  dueInDays?: number;
} {
  switch (d) {
    case "h1":
      return { dueInMinutes: 60 };
    case "h2":
      return { dueInMinutes: 120 };
    case "h3":
      return { dueInMinutes: 180 };
    case "h4":
      return { dueInMinutes: 240 };
    case "allDay":
      return { dueInMinutes: 8 * 60 };
    case "tomorrow":
      return { dueInDays: 1 };
    case "d2":
      return { dueInDays: 2 };
    case "week":
      return { dueInDays: 7 };
    default:
      return { dueInMinutes: Math.max(1, Math.round(customMinutes)) };
  }
}

export function taskDueOf(a: { dueInMinutes?: number; dueInDays?: number }): TaskDue {
  if (a.dueInDays === 1) return "tomorrow";
  if (a.dueInDays === 2) return "d2";
  if (a.dueInDays === 7) return "week";
  const m = a.dueInMinutes;
  if (m === 60) return "h1";
  if (m === 120) return "h2";
  if (m === 180) return "h3";
  if (m === 240) return "h4";
  if (m === 480) return "allDay";
  if (m == null && a.dueInDays == null) return "tomorrow";
  return "custom";
}

/** «Kutish»: amount + unit → minutes. */
export type WaitUnit = "minute" | "hour" | "day";
export function waitMinutes(n: number, unit: WaitUnit): number {
  const k = unit === "day" ? 1440 : unit === "hour" ? 60 : 1;
  return Math.max(1, Math.round((Number.isFinite(n) ? n : 1) * k));
}
export function waitParts(minutes: number): { n: number; unit: WaitUnit } {
  if (minutes % 1440 === 0) return { n: minutes / 1440, unit: "day" };
  if (minutes % 60 === 0) return { n: minutes / 60, unit: "hour" };
  return { n: minutes, unit: "minute" };
}

/** «API'ga yuborish»: the request body, in either of 5CRM's two formats. */
export function apiPayload(
  lead: Record<string, unknown>,
  fields: { name: string; label: string; source: string }[],
  format: "fields" | "flat",
): unknown {
  const value = (src: string) => {
    const v = src.startsWith("custom:")
      ? (lead["custom_fields"] as Record<string, unknown> | null)?.[src.slice(7)]
      : lead[src];
    return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  };
  const rows = fields.filter((f) => f.name && f.source);
  if (format === "flat") return Object.fromEntries(rows.map((f) => [f.name, value(f.source)]));
  return {
    fields: rows.map((f) => ({ type: f.name, label: f.label || f.name, value: value(f.source) })),
  };
}

const PRICE_WORDS = [
  "narx",
  "narxi",
  "qancha",
  "nechpul",
  "necha pul",
  "kurs",
  "to'lov",
  "tolov",
  "цена",
  "сколько",
  "стоимость",
  "курс",
  "price",
  "cost",
  "how much",
];

/**
 * «Avto yozishma»: what the client's messages since the lead came in say.
 * "price" when they ask about the price or the course (or a word of the
 * company's own list), "media" when they only sent pictures / reels, else
 * null.
 */
export function classifyChat(
  messages: { text: string | null; media: boolean }[],
  extraWords: string[] = [],
): "price" | "media" | null {
  if (messages.length === 0) return null;
  const words = [...PRICE_WORDS, ...extraWords.map((w) => w.trim().toLowerCase()).filter(Boolean)];
  const texts = messages.map((m) => (m.text ?? "").toLowerCase()).filter(Boolean);
  if (texts.some((t) => words.some((w) => t.includes(w)))) return "price";
  if (messages.every((m) => m.media && !(m.text ?? "").trim())) return "media";
  return null;
}

/**
 * «Lidni taqsimlash» with shares: the person whose open leads per share is
 * lowest gets the next lead (ties: the first in the list). Weights 1-10,
 * missing = 1. Returns null for an empty list.
 */
export function pickByWeight(
  ids: string[],
  openLeads: Record<string, number>,
  weights: Record<string, number> = {},
): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const id of ids) {
    const w = Math.min(10, Math.max(1, Number(weights[id]) || 1));
    const score = (openLeads[id] ?? 0) / w;
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}
