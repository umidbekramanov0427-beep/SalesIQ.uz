// Server-only. A company's own Payme / Click merchant account for taking
// payments from its clients (org_payment_merchants). Keys are sealed with
// secret-box and only opened here.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openSecret, sealSecret } from "@/lib/secret-box.server";

export type Merchant = {
  paymeMerchantId: string | null;
  paymeKey: string | null;
  clickServiceId: string | null;
  clickMerchantId: string | null;
  clickKey: string | null;
  paidStages: Record<string, unknown>;
};

export async function loadMerchant(organizationId: string): Promise<Merchant | null> {
  const { data, error } = await supabaseAdmin
    .from("org_payment_merchants")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    paymeMerchantId: data.payme_merchant_id,
    paymeKey: openSecret(data.payme_key_sealed),
    clickServiceId: data.click_service_id,
    clickMerchantId: data.click_merchant_id,
    clickKey: openSecret(data.click_key_sealed),
    paidStages:
      data.paid_stages && typeof data.paid_stages === "object" && !Array.isArray(data.paid_stages)
        ? (data.paid_stages as Record<string, unknown>)
        : {},
  };
}

export const paymeReady = (m: Merchant | null) => !!(m?.paymeMerchantId && m.paymeKey);
export const clickReady = (m: Merchant | null) =>
  !!(m?.clickServiceId && m.clickMerchantId && m.clickKey);

export type MerchantPatch = {
  paymeMerchantId?: string | null | undefined;
  /** undefined keeps the stored key, "" removes it. */
  paymeKey?: string | undefined;
  clickServiceId?: string | null | undefined;
  clickMerchantId?: string | null | undefined;
  clickKey?: string | undefined;
  paidStages?: Record<string, string> | undefined;
};

export async function saveMerchant(
  organizationId: string,
  userId: string,
  patch: MerchantPatch,
): Promise<void> {
  const row: Record<string, unknown> = {
    organization_id: organizationId,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (patch.paymeMerchantId !== undefined) row["payme_merchant_id"] = patch.paymeMerchantId || null;
  if (patch.paymeKey !== undefined)
    row["payme_key_sealed"] = patch.paymeKey ? sealSecret(patch.paymeKey) : null;
  if (patch.clickServiceId !== undefined) row["click_service_id"] = patch.clickServiceId || null;
  if (patch.clickMerchantId !== undefined) row["click_merchant_id"] = patch.clickMerchantId || null;
  if (patch.clickKey !== undefined)
    row["click_key_sealed"] = patch.clickKey ? sealSecret(patch.clickKey) : null;
  if (patch.paidStages !== undefined) row["paid_stages"] = patch.paidStages;
  const { error } = await supabaseAdmin
    .from("org_payment_merchants")
    .upsert(row as never, { onConflict: "organization_id" });
  if (error) throw error;
}
