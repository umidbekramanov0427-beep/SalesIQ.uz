// Majburiy maydonlar (the lead card's "Sozlamalar" tab -> ✱): rows that must
// be filled before a lead moves to another stage. Closing a lead as lost
// never waits for them, and leads synced from amoCRM / Bitrix24 aren't
// checked (they are analytics only). Stored as row keys in the card layout
// (lead_workspace_sections.leadCard.required): "cf:<field id>" for the
// company's own fields, "source" / "campaign" / "stream" for built-in lead
// rows, "c:<key>" for the contact's rows.

const LEAD_KEYS = ["source", "campaign", "stream"] as const;
const CONTACT_KEYS = ["phone", "altPhone", "email", "telegram", "company", "position"] as const;

/** Whether a row can be made required (owner, budget, created, priority always have a value). */
export function isRequirableKey(key: string): boolean {
  if (key.startsWith("cf:")) return key.length > 3;
  if ((LEAD_KEYS as readonly string[]).includes(key)) return true;
  return key.startsWith("c:") && (CONTACT_KEYS as readonly string[]).includes(key.slice(2));
}

/** The lead fields the check reads (CrmLeadView has them all). */
export type RequirableLead = {
  source: string;
  campaign: string;
  stream: string;
  phone: string;
  altPhone: string;
  email: string;
  telegram: string;
  company: string;
  position: string;
  customFields: Record<string, unknown>;
  amocrmId?: number | string | null;
};

const filled = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(filled);
  if (typeof v === "boolean") return true;
  return true;
};

/**
 * The required rows this lead still has empty, as row keys (in the order
 * they were made required). Field definitions map "cf:<id>" to the value's
 * key in customFields; a field that no longer exists is skipped.
 */
export function missingRequired(
  required: readonly string[],
  lead: RequirableLead,
  defs: readonly { id: string; key: string }[],
): string[] {
  if (lead.amocrmId) return [];
  const keyOf = new Map(defs.map((d) => [d.id, d.key]));
  return required.filter((k) => {
    if (k.startsWith("cf:")) {
      const key = keyOf.get(k.slice(3));
      return key !== undefined && !filled(lead.customFields[key]);
    }
    if (k.startsWith("c:")) {
      const ck = k.slice(2) as (typeof CONTACT_KEYS)[number];
      return (CONTACT_KEYS as readonly string[]).includes(ck) && !filled(lead[ck]);
    }
    if ((LEAD_KEYS as readonly string[]).includes(k)) {
      return !filled(lead[k as (typeof LEAD_KEYS)[number]]);
    }
    return false;
  });
}
