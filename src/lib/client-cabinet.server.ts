// Server-only. Mijoz kabineti: the private link a manager sends a client
// (migration 20261224000000). createCabinetLink makes or renews a lead's
// link; loadCabinet gathers what the client may see -- their orders (the
// leads of the same contact), payments, open payment links, invoices and
// the chat -- and nothing internal (no notes, tasks, AI scores or other
// clients). The token is the only key, so it is long and random.
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /client_cabinets/.test(e.message ?? ""));

export const newCabinetToken = () => randomBytes(24).toString("base64url");

export type CabinetLink = {
  token: string;
  createdAt: string;
  lastOpenedAt: string | null;
  opens: number;
};

/** The lead's live link (made if there is none); renew revokes the old one first. */
export async function createCabinetLink(
  organizationId: string,
  leadId: string,
  by: string,
  renew: boolean,
): Promise<CabinetLink> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, organization_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.organization_id !== organizationId) throw new Error("NOT_FOUND");

  const now = new Date().toISOString();
  if (renew) {
    const { error } = await supabaseAdmin
      .from("client_cabinets")
      .update({ revoked_at: now })
      .eq("lead_id", leadId)
      .is("revoked_at", null);
    if (error) throw missingTable(error) ? new Error("MIGRATION_PENDING") : error;
  } else {
    const { data: live, error } = await supabaseAdmin
      .from("client_cabinets")
      .select("token, created_at, last_opened_at, open_count")
      .eq("lead_id", leadId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw missingTable(error) ? new Error("MIGRATION_PENDING") : error;
    if (live)
      return {
        token: live.token,
        createdAt: live.created_at,
        lastOpenedAt: live.last_opened_at,
        opens: live.open_count,
      };
  }
  const token = newCabinetToken();
  const { error } = await supabaseAdmin.from("client_cabinets").insert({
    token,
    organization_id: organizationId,
    lead_id: leadId,
    created_by: by,
  });
  if (error) throw missingTable(error) ? new Error("MIGRATION_PENDING") : error;
  return { token, createdAt: now, lastOpenedAt: null, opens: 0 };
}

export async function revokeCabinetLink(organizationId: string, leadId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("client_cabinets")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .is("revoked_at", null);
  if (error) throw missingTable(error) ? new Error("MIGRATION_PENDING") : error;
}

export type Cabinet = {
  company: { name: string; logo: string | null };
  client: { name: string };
  manager: { name: string; phone: string | null } | null;
  orders: {
    id: string;
    name: string;
    stage: string | null;
    amount: number;
    paid: number;
    createdAt: string;
    closed: "won" | "lost" | null;
  }[];
  payments: { id: string; amount: number; method: string | null; paidAt: string; order: string }[];
  bills: {
    id: string;
    amount: number;
    description: string | null;
    status: string;
    createdAt: string;
    paidAt: string | null;
    order: string;
  }[];
  invoices: {
    id: string;
    number: string | null;
    date: string | null;
    total: number;
    currency: string | null;
    status: string | null;
    order: string;
  }[];
  messages: {
    id: string;
    fromClient: boolean;
    text: string;
    file: string | null;
    channel: string | null;
    at: string;
  }[];
};

/** Everything the client's page shows, or null for an unknown / revoked link. */
export async function loadCabinet(token: string): Promise<Cabinet | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data: cab, error } = await supabaseAdmin
    .from("client_cabinets")
    .select("token, organization_id, lead_id, revoked_at, open_count")
    .eq("token", token)
    .maybeSingle();
  if (error || !cab || cab.revoked_at) return null;
  const org = cab.organization_id;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, contact_id, owner_id")
    .eq("id", cab.lead_id)
    .maybeSingle();
  if (!lead) return null;

  // The client's orders: every lead of the same contact in this company.
  const { data: leadRows } = lead.contact_id
    ? await supabaseAdmin
        .from("leads")
        .select("id, name, stage_id, budget, paid_amount, created_at")
        .eq("organization_id", org)
        .eq("contact_id", lead.contact_id)
        .order("created_at", { ascending: false })
        .limit(20)
    : await supabaseAdmin
        .from("leads")
        .select("id, name, stage_id, budget, paid_amount, created_at")
        .eq("id", lead.id);
  const leads = leadRows ?? [];
  const ids = leads.map((l) => l.id);
  const orderName = new Map(leads.map((l) => [l.id, l.name as string]));

  const [orgRow, general, contact, owner, stages, payments, bills, invoices, messages] =
    await Promise.all([
      supabaseAdmin.from("organizations").select("name").eq("id", org).maybeSingle(),
      supabaseAdmin
        .from("org_general_settings")
        .select("*")
        .eq("organization_id", org)
        .maybeSingle(),
      lead.contact_id
        ? supabaseAdmin.from("contacts").select("full_name").eq("id", lead.contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      lead.owner_id
        ? supabaseAdmin
            .from("profiles")
            .select("full_name, phone")
            .eq("id", lead.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, is_won, is_lost")
        .in(
          "id",
          leads.map((l) => l.stage_id).filter((x): x is string => !!x),
        ),
      supabaseAdmin
        .from("lead_payments")
        .select("id, lead_id, amount, method, paid_at")
        .in("lead_id", ids)
        .order("paid_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("lead_payment_links")
        .select("id, lead_id, amount, description, status, created_at, paid_at")
        .in("lead_id", ids)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("invoices")
        .select("id, lead_id, number, invoice_date, total, currency, status")
        .in("lead_id", ids)
        .in("status", ["sent", "paid"])
        .order("invoice_date", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("lead_telegram_messages")
        .select("id, direction, text, file_name, file_kind, channel, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

  const stage = new Map((stages.data ?? []).map((s) => [s.id, s]));
  const logo =
    (general.data as { company_logo_url?: string | null } | null)?.company_logo_url ?? null;

  void supabaseAdmin
    .from("client_cabinets")
    .update({ last_opened_at: new Date().toISOString(), open_count: (cab.open_count ?? 0) + 1 })
    .eq("token", token)
    .then(() => undefined);

  return {
    company: { name: orgRow.data?.name ?? "", logo },
    client: { name: contact.data?.full_name || lead.name },
    manager: owner.data
      ? { name: owner.data.full_name ?? "", phone: owner.data.phone ?? null }
      : null,
    orders: leads.map((l) => {
      const s = l.stage_id ? stage.get(l.stage_id) : undefined;
      return {
        id: l.id,
        name: l.name,
        stage: s?.name ?? null,
        amount: Number(l.budget) || 0,
        paid: Number(l.paid_amount) || 0,
        createdAt: l.created_at,
        closed: s?.is_won ? "won" : s?.is_lost ? "lost" : null,
      };
    }),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.amount) || 0,
      method: p.method,
      paidAt: p.paid_at,
      order: orderName.get(p.lead_id) ?? "",
    })),
    bills: (bills.data ?? []).map((b) => ({
      id: b.id,
      amount: Number(b.amount) || 0,
      description: b.description,
      status: b.status,
      createdAt: b.created_at,
      paidAt: b.paid_at,
      order: orderName.get(b.lead_id) ?? "",
    })),
    invoices: (invoices.data ?? []).map((i) => ({
      id: i.id,
      number: i.number,
      date: i.invoice_date,
      total: Number(i.total) || 0,
      currency: i.currency,
      status: i.status,
      order: i.lead_id ? (orderName.get(i.lead_id) ?? "") : "",
    })),
    messages: (messages.data ?? []).reverse().map((m) => ({
      id: m.id,
      fromClient: m.direction === "in",
      text: m.text ?? "",
      file: m.file_name ?? (m.file_kind ? String(m.file_kind) : null),
      channel: m.channel ?? null,
      at: m.created_at,
    })),
  };
}
