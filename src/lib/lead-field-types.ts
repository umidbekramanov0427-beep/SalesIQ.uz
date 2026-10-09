import type { LeadFieldValue } from "@/hooks/use-crm-data";

// The kinds of lead field an admin can create (amoCRM's list): what each
// stores in leads.custom_fields and how it reads back as text.

export const LEAD_FIELD_TYPES = [
  "text",
  "number",
  "textarea",
  "select",
  "multiselect",
  "radio",
  "toggle",
  "date",
  "datetime",
  "birthday",
  "url",
  "address",
] as const;
export type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];

/** Types whose values come from a list of options the admin writes. */
export const OPTION_FIELD_TYPES = new Set<string>(["select", "multiselect", "radio"]);

export function asFieldType(v: string): LeadFieldType {
  return (LEAD_FIELD_TYPES as readonly string[]).includes(v) ? (v as LeadFieldType) : "text";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A stored value as one line of text ("" when empty). Dates read dd.mm.yyyy. */
export function fieldValueText(type: string, v: LeadFieldValue | undefined, yes = "✓"): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? yes : "";
  if (Array.isArray(v)) return v.join(", ");
  if (type === "date" || type === "birthday" || type === "datetime") {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const day = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    return type === "datetime" ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
  }
  return v;
}
