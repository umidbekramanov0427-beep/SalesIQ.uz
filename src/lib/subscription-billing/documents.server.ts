import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBillingStatus } from "./billing-data.server";
import {
  docNumber,
  parseRequisites,
  proformaNumber,
  requisitesReady,
  serviceLine,
  splitAmount,
  type Requisites,
} from "./documents";

// Builds one subscription document for the print page: SalesIQ as the
// seller (platform_settings.company_requisites), the company as the buyer
// (its Hisob-faktura settings, else just its name), the service line and
// the amount split into price and VAT.

export type DocKind = "invoice" | "act" | "proforma";

export type Buyer = {
  name: string;
  tin: string | null;
  vat_reg_code: string | null;
  account: string | null;
  bank_mfo: string | null;
  bank_name: string | null;
  address: string | null;
  director: string | null;
};

export type BillingDoc = {
  kind: DocKind;
  number: string;
  date: string;
  seller: Requisites;
  sellerReady: boolean;
  buyer: Buyer;
  line: string;
  amounts: { sum: number; vat: number; total: number };
  provider: string | null;
  paidAt: string | null;
};

export async function loadPlatformRequisites(): Promise<Requisites> {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  return parseRequisites((data as { company_requisites?: unknown } | null)?.company_requisites);
}

export async function savePlatformRequisites(raw: unknown): Promise<Requisites> {
  const req = parseRequisites(raw);
  const { error } = await supabaseAdmin
    .from("platform_settings")
    .update({ company_requisites: req })
    .eq("id", true);
  if (error) {
    throw new Error(
      /column|schema cache/.test(error.message) ? "MIGRATION_PENDING" : error.message,
    );
  }
  return req;
}

async function loadBuyer(orgId: string): Promise<Buyer> {
  const [{ data: org }, { data: s }] = await Promise.all([
    supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabaseAdmin
      .from("org_invoice_settings")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  return {
    name: s?.company_name || org?.name || "—",
    tin: s?.tin || null,
    vat_reg_code: s?.vat_reg_code ?? null,
    account: s?.account ?? null,
    bank_mfo: s?.bank_mfo ?? null,
    bank_name: s?.bank_name ?? null,
    address: s?.address ?? null,
    director: s?.director ?? null,
  };
}

export type DocResult =
  { ok: true; doc: BillingDoc } | { ok: false; status: number; error: string };

/**
 * One document. `orgId` is the viewer's company (null = the platform
 * owner, who may open any company's documents).
 */
export async function loadBillingDoc(
  kind: DocKind,
  paymentId: string | null,
  orgId: string | null,
): Promise<DocResult> {
  const seller = await loadPlatformRequisites();

  if (kind === "proforma") {
    if (!orgId) return { ok: false, status: 400, error: "NO_COMPANY" };
    const [status, buyer, { data: org }] = await Promise.all([
      getBillingStatus(orgId),
      loadBuyer(orgId),
      supabaseAdmin.from("organizations").select("plan").eq("id", orgId).maybeSingle(),
    ]);
    if (!status.priceUzs) return { ok: false, status: 400, error: "NO_PRICE" };
    const now = new Date();
    return {
      ok: true,
      doc: {
        kind,
        number: proformaNumber(orgId, now),
        date: now.toISOString(),
        seller,
        sellerReady: requisitesReady(seller),
        buyer,
        line: serviceLine(org?.plan, now),
        amounts: splitAmount(status.priceUzs, seller.has_vat, seller.vat_rate),
        provider: null,
        paidAt: null,
      },
    };
  }

  if (!paymentId) return { ok: false, status: 400, error: "payment required" };
  const { data: p } = await supabaseAdmin
    .from("platform_subscription_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!p || (orgId && p.organization_id !== orgId)) {
    return { ok: false, status: 404, error: "NOT_FOUND" };
  }
  if (p.status !== "paid" || !p.paid_at) return { ok: false, status: 400, error: "NOT_PAID" };
  const row = p as typeof p & { doc_number?: number | null; plan?: string | null };
  const [buyer, { data: org }] = await Promise.all([
    loadBuyer(p.organization_id),
    supabaseAdmin.from("organizations").select("plan").eq("id", p.organization_id).maybeSingle(),
  ]);
  return {
    ok: true,
    doc: {
      kind,
      number: docNumber(row.doc_number, p.id),
      date: p.paid_at,
      seller,
      sellerReady: requisitesReady(seller),
      buyer,
      line: serviceLine(row.plan ?? org?.plan, new Date(p.paid_at)),
      amounts: splitAmount(Number(p.amount), seller.has_vat, seller.vat_rate),
      provider: p.provider,
      paidAt: p.paid_at,
    },
  };
}
