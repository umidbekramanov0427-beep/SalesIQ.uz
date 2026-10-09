// Server-only. Bulk lead import from a spreadsheet (Excel / CSV / Google
// Sheets) -- the browser has already parsed the file and applied the
// admin's column mapping, so each row arrives as plain lead fields. This
// validates everything against the org, optionally skips phones that
// already exist, and inserts contacts + leads in bulk.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ImportLeadRow = {
  /** The lead's (deal's) name. */
  name?: string;
  /** The contact person's full name; the lead name falls back to it. */
  contactName?: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  telegram?: string;
  company?: string;
  position?: string;
  budget?: string;
  source?: string;
  city?: string;
  region?: string;
  address?: string;
  note?: string;
  stage?: string;
  /** Stage / owner already matched in the browser (amoCRM-style mapping). */
  stageId?: string;
  ownerId?: string;
  tags?: string[];
  customFields?: Record<string, string>;
};

export type ImportOptions = {
  funnel: string;
  stageId: string | null;
  ownerId: string | null;
  tags: string[];
  skipDuplicates: boolean;
  sourceLabel: string;
};

export type ImportResult = {
  imported: number;
  skippedDuplicates: number;
  skippedEmpty: number;
  errors: string[];
};

export const MAX_IMPORT_ROWS = 1000;

function clean(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Variants a phone may already be stored under, for the duplicate lookup. */
function phoneVariants(phone: string): string[] {
  const d = digits(phone);
  if (d.length < 7) return [phone];
  const local = d.slice(-9);
  return [phone, d, `+${d}`, `998${local}`, `+998${local}`, local];
}

function parseBudget(raw: string): number {
  const n = Number(
    raw
      .replace(/[^\d.,-]/g, "")
      .replace(/,(?=\d{3}\b)/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function importLeads(
  organizationId: string,
  actorId: string,
  rows: ImportLeadRow[],
  opts: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skippedDuplicates: 0, skippedEmpty: 0, errors: [] };

  const { data: stages } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, pipeline_name, key, position")
    .eq("organization_id", organizationId);
  const funnelStages = (stages ?? [])
    .filter((s) => (s.pipeline_name || "Direct Sales") === opts.funnel)
    .sort((a, b) => a.position - b.position);
  const defaultStage =
    funnelStages.find((s) => s.id === opts.stageId) ??
    (opts.stageId ? undefined : funnelStages[0]) ??
    null;
  if (opts.stageId && !defaultStage) throw new Error("Stage not found in this funnel");
  const stageByName = new Map(funnelStages.map((s) => [s.name.trim().toLowerCase(), s]));

  const stageById = new Map(funnelStages.map((s) => [s.id, s]));
  const { data: orgProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId);
  const orgProfileIds = new Set((orgProfiles ?? []).map((p) => p.id));

  let ownerId = actorId;
  if (opts.ownerId) {
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", opts.ownerId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!owner) throw new Error("Owner not found in this organization");
    ownerId = owner.id;
  }

  // Normalize + drop empty rows.
  const prepared = rows
    .map((r) => ({
      name: clean(r.name, 200),
      contactName: clean(r.contactName, 200),
      phone: clean(r.phone, 40),
      altPhone: clean(r.altPhone, 40),
      email: clean(r.email, 200),
      telegram: clean(r.telegram, 100),
      company: clean(r.company, 200),
      position: clean(r.position, 120),
      budget: parseBudget(clean(r.budget, 40)),
      source: clean(r.source, 120),
      city: clean(r.city, 120),
      region: clean(r.region, 120),
      address: clean(r.address, 300),
      note: clean(r.note, 4000),
      stage: clean(r.stage, 120).toLowerCase(),
      stageId: clean(r.stageId, 64),
      ownerId: clean(r.ownerId, 64),
      tags: Array.isArray(r.tags) ? r.tags.map((t) => clean(t, 60)).filter(Boolean) : [],
      customFields: Object.fromEntries(
        Object.entries(r.customFields ?? {})
          .map(([k, v]) => [clean(k, 80), clean(v, 500)] as const)
          .filter(([k, v]) => k && v),
      ),
    }))
    .filter((r) => {
      const keep = !!(r.name || r.contactName || r.phone || r.email || r.company);
      if (!keep) result.skippedEmpty++;
      return keep;
    });

  let toInsert = prepared;
  if (opts.skipDuplicates) {
    const variants = [...new Set(prepared.flatMap((r) => (r.phone ? phoneVariants(r.phone) : [])))];
    // Only a client who already has a lead in THIS funnel is a duplicate --
    // the same person may well be a separate lead in another funnel.
    const phoneByContact = new Map<string, string>();
    for (let i = 0; i < variants.length; i += 300) {
      const { data } = await supabaseAdmin
        .from("contacts")
        .select("id, phone")
        .eq("organization_id", organizationId)
        .in("phone", variants.slice(i, i + 300));
      for (const c of data ?? []) if (c.phone) phoneByContact.set(c.id, digits(c.phone).slice(-9));
    }
    const existing = new Set<string>();
    const contactIds = [...phoneByContact.keys()];
    for (let i = 0; i < contactIds.length; i += 300) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("contact_id, funnel")
        .eq("organization_id", organizationId)
        .in("contact_id", contactIds.slice(i, i + 300));
      for (const l of data ?? []) {
        const key = l.contact_id ? phoneByContact.get(l.contact_id) : undefined;
        if (key && (l.funnel || "Direct Sales") === opts.funnel) existing.add(key);
      }
    }
    const seen = new Set<string>();
    toInsert = prepared.filter((r) => {
      if (!r.phone) return true;
      const key = digits(r.phone).slice(-9);
      if (existing.has(key) || seen.has(key)) {
        result.skippedDuplicates++;
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // A row's own owner when it names someone in this org, else the default.
  const ownerOf = (r: { ownerId: string }) =>
    r.ownerId && orgProfileIds.has(r.ownerId) ? r.ownerId : ownerId;

  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    try {
      // Contacts for rows that have any way to reach them; one multi-row
      // insert returns ids in the same order as the input rows.
      const withContact = batch.filter(
        (r) => r.contactName || r.phone || r.email || r.telegram || r.altPhone,
      );
      const contactIdByRow = new Map<(typeof batch)[number], string>();
      if (withContact.length > 0) {
        const { data: contacts, error } = await supabaseAdmin
          .from("contacts")
          .insert(
            withContact.map((r) => ({
              organization_id: organizationId,
              full_name: r.contactName || r.name || r.phone || r.email,
              phone: r.phone || null,
              alt_phone: r.altPhone || null,
              email: r.email || null,
              telegram: r.telegram || null,
              position: r.position || null,
              owner_id: ownerOf(r),
            })),
          )
          .select("id");
        if (error) throw error;
        (contacts ?? []).forEach((c, idx) => contactIdByRow.set(withContact[idx]!, c.id));
      }

      const { data: leads, error: leadErr } = await supabaseAdmin
        .from("leads")
        .insert(
          batch.map((r) => {
            const stage =
              (r.stageId && stageById.get(r.stageId)) ||
              (r.stage && stageByName.get(r.stage)) ||
              defaultStage;
            return {
              organization_id: organizationId,
              name: r.name || r.contactName || r.company || r.phone || r.email,
              contact_id: contactIdByRow.get(r) ?? null,
              company_name: r.company,
              budget: r.budget,
              source: r.source || opts.sourceLabel,
              city: r.city || null,
              region: r.region || null,
              address: r.address || null,
              owner_id: ownerOf(r),
              stage_id: stage?.id ?? null,
              funnel: stage?.pipeline_name || opts.funnel,
              tags: [...new Set([...opts.tags, ...r.tags])],
              custom_fields: r.customFields,
            };
          }),
        )
        .select("id");
      if (leadErr) throw leadErr;
      result.imported += leads?.length ?? 0;

      const notes = (leads ?? [])
        .map((l, idx) => ({ leadId: l.id, note: batch[idx]!.note }))
        .filter((n) => n.note);
      if (notes.length > 0) {
        await supabaseAdmin.from("lead_activities").insert(
          notes.map((n) => ({
            organization_id: organizationId,
            lead_id: n.leadId,
            type: "note",
            content: n.note,
            created_by: actorId,
          })),
        );
      }
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      if (result.errors.length < 10) result.errors.push(message);
    }
  }
  return result;
}

/** docs.google.com sheet link -> its CSV export URL (first tab unless the link names one). */
export function googleSheetCsvUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const id = url.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1];
  if (!id) return null;
  const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}
