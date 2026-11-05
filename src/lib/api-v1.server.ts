// Server-only. Shapes for the public /api/v1 (API kalitlari): one lead
// object for every endpoint, read through the service role and always
// filtered by the calling key's company.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const LEAD_COLUMNS =
  "id, name, funnel, stage_id, budget, owner_id, contact_id, source, campaign, tags, custom_fields, created_at, updated_at";

type LeadRow = {
  id: string;
  name: string;
  funnel: string | null;
  stage_id: string | null;
  budget: number | null;
  owner_id: string | null;
  contact_id: string | null;
  source: string | null;
  campaign: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ApiLead = {
  id: string;
  name: string;
  funnel: string | null;
  stage: { id: string; name: string } | null;
  budget: number;
  owner: { id: string; name: string | null } | null;
  contact: { name: string | null; phone: string | null; email: string | null } | null;
  source: string | null;
  campaign: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Lead rows with their stage, owner and contact resolved in three batched reads. */
export async function serializeLeads(organizationId: string, rows: LeadRow[]): Promise<ApiLead[]> {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const stageIds = uniq(rows.map((r) => r.stage_id));
  const ownerIds = uniq(rows.map((r) => r.owner_id));
  const contactIds = uniq(rows.map((r) => r.contact_id));
  const [stages, owners, contacts] = await Promise.all([
    stageIds.length
      ? supabaseAdmin
          .from("pipeline_stages")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", stageIds)
      : { data: [] },
    ownerIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .eq("organization_id", organizationId)
          .in("id", ownerIds)
      : { data: [] },
    contactIds.length
      ? supabaseAdmin
          .from("contacts")
          .select("id, full_name, phone, email")
          .eq("organization_id", organizationId)
          .in("id", contactIds)
      : { data: [] },
  ]);
  const stage = new Map((stages.data ?? []).map((s) => [s.id, s.name as string]));
  const owner = new Map((owners.data ?? []).map((p) => [p.id, p.full_name as string | null]));
  const contact = new Map(
    (contacts.data ?? []).map((c) => [
      c.id,
      {
        name: c.full_name as string | null,
        phone: c.phone as string | null,
        email: c.email as string | null,
      },
    ]),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    funnel: r.funnel,
    stage: r.stage_id ? { id: r.stage_id, name: stage.get(r.stage_id) ?? "" } : null,
    budget: Number(r.budget) || 0,
    owner: r.owner_id ? { id: r.owner_id, name: owner.get(r.owner_id) ?? null } : null,
    contact: r.contact_id ? (contact.get(r.contact_id) ?? null) : null,
    source: r.source,
    campaign: r.campaign,
    tags: r.tags ?? [],
    custom_fields: r.custom_fields ?? {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function loadApiLead(organizationId: string, id: string): Promise<ApiLead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return (await serializeLeads(organizationId, [data as unknown as LeadRow]))[0] ?? null;
}

export const apiError = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status });

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await request.json()) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
