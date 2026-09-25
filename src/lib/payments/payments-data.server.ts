// Server-only. Credentials CRUD for the two payment providers + the shared
// "create a payment link for a lead" entrypoint used by both. See
// payme.server.ts / click.server.ts for the actual provider protocols.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPaymeCheckoutUrl } from "./payme.server";
import { buildClickCheckoutUrl } from "./click.server";

export type PaymentProvider = "payme" | "click";

export type PaymeCredentialsStatus = { connected: boolean; merchantId: string | null };
export type ClickCredentialsStatus = {
  connected: boolean;
  serviceId: string | null;
  merchantId: string | null;
};

export async function getPaymeCredentialsStatus(
  organizationId: string,
): Promise<PaymeCredentialsStatus> {
  const { data } = await supabaseAdmin
    .from("org_payme_credentials")
    .select("merchant_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { connected: !!data, merchantId: data?.merchant_id ?? null };
}

export async function savePaymeCredentials(
  organizationId: string,
  connectedBy: string,
  input: { merchantId: string; secretKey: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_payme_credentials").upsert({
    organization_id: organizationId,
    merchant_id: input.merchantId,
    secret_key: input.secretKey,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function disconnectPayme(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_payme_credentials")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function getClickCredentialsStatus(
  organizationId: string,
): Promise<ClickCredentialsStatus> {
  const { data } = await supabaseAdmin
    .from("org_click_credentials")
    .select("service_id, merchant_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return {
    connected: !!data,
    serviceId: data?.service_id ?? null,
    merchantId: data?.merchant_id ?? null,
  };
}

export async function saveClickCredentials(
  organizationId: string,
  connectedBy: string,
  input: { serviceId: string; merchantId: string; secretKey: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_click_credentials").upsert({
    organization_id: organizationId,
    service_id: input.serviceId,
    merchant_id: input.merchantId,
    secret_key: input.secretKey,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function disconnectClick(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_click_credentials")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function createLeadPaymentLink(
  organizationId: string,
  createdBy: string,
  leadId: string,
  provider: PaymentProvider,
  amountSom: number,
): Promise<{ id: string; payUrl: string }> {
  const { data: row, error } = await supabaseAdmin
    .from("lead_payments")
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      provider,
      amount: amountSom,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;

  let payUrl: string;
  if (provider === "payme") {
    const { data: creds } = await supabaseAdmin
      .from("org_payme_credentials")
      .select("merchant_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!creds) throw new Error("Payme ulanmagan.");
    payUrl = buildPaymeCheckoutUrl(creds.merchant_id, row.id, amountSom);
  } else {
    const { data: creds } = await supabaseAdmin
      .from("org_click_credentials")
      .select("service_id, merchant_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!creds) throw new Error("Click ulanmagan.");
    payUrl = buildClickCheckoutUrl(creds.service_id, creds.merchant_id, row.id, amountSom);
  }

  const { error: updateError } = await supabaseAdmin
    .from("lead_payments")
    .update({ pay_url: payUrl })
    .eq("id", row.id);
  if (updateError) throw updateError;

  return { id: row.id, payUrl };
}
