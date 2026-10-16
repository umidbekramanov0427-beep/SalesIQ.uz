// Server-only. The platform's own Payme/Click merchant credentials +
// per-tier subscription prices, and the "an org paid, extend and
// reactivate it" side effect the two webhook handlers call once a payment
// is confirmed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPaymeCheckoutUrl } from "./payme.server";
import { buildClickCheckoutUrl } from "./click.server";
import { rewardReferral } from "@/lib/referral.server";
import { effectivePriceUzs, normalizePlan, type Plan } from "@/lib/plan-gating";

export type SubscriptionPaymentProvider = "payme" | "click";

// One month per payment -- a simple fixed-cadence renewal, matching the
// existing manual subscription_requests flow this replaces (which also
// has no notion of buying more or less than "the next period").
const RENEWAL_DAYS = 30;

export type PlanPrices = Record<Plan, number>;

async function getPlanPrices(): Promise<{ planPrices: PlanPrices; extraSeatPriceUzs: number }> {
  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("price_start_iq_uzs, price_analyst_iq_uzs, price_master_iq_uzs, extra_seat_price_uzs")
    .eq("id", true)
    .maybeSingle();
  return {
    planPrices: {
      start_iq: settings?.price_start_iq_uzs ?? 0,
      analyst_iq: settings?.price_analyst_iq_uzs ?? 0,
      master_iq: settings?.price_master_iq_uzs ?? 0,
    },
    extraSeatPriceUzs: settings?.extra_seat_price_uzs ?? 0,
  };
}

export type BillingStatus = {
  plan: Plan;
  priceUzs: number;
  extraSeats: number;
  extraSeatPriceUzs: number;
  paymeConnected: boolean;
  clickConnected: boolean;
};

// Safe for any authenticated org member -- never exposes the secret keys,
// only whether each provider is configured and what this org's own plan
// actually costs (its tier's price plus any granted extra seats).
export async function getBillingStatus(organizationId: string): Promise<BillingStatus> {
  const [{ planPrices, extraSeatPriceUzs }, { data: org }, { data: creds }] = await Promise.all([
    getPlanPrices(),
    supabaseAdmin
      .from("organizations")
      .select("plan, extra_seats")
      .eq("id", organizationId)
      .maybeSingle(),
    supabaseAdmin
      .from("platform_payment_credentials")
      .select(
        "payme_merchant_id, payme_secret_key, click_service_id, click_merchant_id, click_secret_key",
      )
      .eq("id", true)
      .maybeSingle(),
  ]);
  const plan = normalizePlan(org?.plan);
  const extraSeats = org?.extra_seats ?? 0;
  return {
    plan,
    priceUzs: effectivePriceUzs(plan, extraSeats, planPrices, extraSeatPriceUzs),
    extraSeats,
    extraSeatPriceUzs,
    paymeConnected: !!(creds?.payme_merchant_id && creds?.payme_secret_key),
    clickConnected: !!(
      creds?.click_service_id &&
      creds?.click_merchant_id &&
      creds?.click_secret_key
    ),
  };
}

export type PlatformPaymentCredentialsRow = {
  payme_merchant_id: string | null;
  payme_secret_key: string | null;
  click_service_id: string | null;
  click_merchant_id: string | null;
  click_secret_key: string | null;
};

// platform_owner-only: returns the full row including secrets, for the
// settings form to prefill (masked) and to know what's already saved.
export async function getPlatformPaymentCredentials(): Promise<PlatformPaymentCredentialsRow | null> {
  const { data } = await supabaseAdmin
    .from("platform_payment_credentials")
    .select(
      "payme_merchant_id, payme_secret_key, click_service_id, click_merchant_id, click_secret_key",
    )
    .eq("id", true)
    .maybeSingle();
  return data ?? null;
}

export async function savePlatformPaymentSettings(
  updatedBy: string,
  input: {
    priceStartIqUzs?: number | undefined;
    priceAnalystIqUzs?: number | undefined;
    priceMasterIqUzs?: number | undefined;
    extraSeatPriceUzs?: number | undefined;
    paymeMerchantId?: string | undefined;
    paymeSecretKey?: string | undefined;
    clickServiceId?: string | undefined;
    clickMerchantId?: string | undefined;
    clickSecretKey?: string | undefined;
  },
): Promise<void> {
  const pricePatch: {
    price_start_iq_uzs?: number;
    price_analyst_iq_uzs?: number;
    price_master_iq_uzs?: number;
    extra_seat_price_uzs?: number;
  } = {};
  if (input.priceStartIqUzs !== undefined) pricePatch.price_start_iq_uzs = input.priceStartIqUzs;
  if (input.priceAnalystIqUzs !== undefined)
    pricePatch.price_analyst_iq_uzs = input.priceAnalystIqUzs;
  if (input.priceMasterIqUzs !== undefined) pricePatch.price_master_iq_uzs = input.priceMasterIqUzs;
  if (input.extraSeatPriceUzs !== undefined)
    pricePatch.extra_seat_price_uzs = input.extraSeatPriceUzs;
  if (Object.keys(pricePatch).length > 0) {
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .update(pricePatch)
      .eq("id", true);
    if (error) throw error;
  }

  const credPatch: Record<string, unknown> = {};
  if (input.paymeMerchantId !== undefined)
    credPatch["payme_merchant_id"] = input.paymeMerchantId || null;
  if (input.paymeSecretKey !== undefined)
    credPatch["payme_secret_key"] = input.paymeSecretKey || null;
  if (input.clickServiceId !== undefined)
    credPatch["click_service_id"] = input.clickServiceId || null;
  if (input.clickMerchantId !== undefined)
    credPatch["click_merchant_id"] = input.clickMerchantId || null;
  if (input.clickSecretKey !== undefined)
    credPatch["click_secret_key"] = input.clickSecretKey || null;
  if (Object.keys(credPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from("platform_payment_credentials")
      .update({ ...credPatch, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw error;
  }
}

export async function createSubscriptionPaymentLink(
  organizationId: string,
  createdBy: string,
  provider: SubscriptionPaymentProvider,
): Promise<{ id: string; payUrl: string }> {
  const [{ planPrices, extraSeatPriceUzs }, { data: org }] = await Promise.all([
    getPlanPrices(),
    supabaseAdmin
      .from("organizations")
      .select("plan, extra_seats")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const amount = effectivePriceUzs(org?.plan, org?.extra_seats ?? 0, planPrices, extraSeatPriceUzs);
  if (!amount || amount <= 0) throw new Error("Obuna narxi hali belgilanmagan.");

  const { data: creds } = await supabaseAdmin
    .from("platform_payment_credentials")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (!creds) throw new Error("To'lov tizimi ulanmagan.");

  const { data: row, error } = await supabaseAdmin
    .from("platform_subscription_payments")
    .insert({ organization_id: organizationId, provider, amount, created_by: createdBy })
    .select("id")
    .single();
  if (error) throw error;

  let payUrl: string;
  if (provider === "payme") {
    if (!creds.payme_merchant_id) throw new Error("Payme ulanmagan.");
    payUrl = buildPaymeCheckoutUrl(creds.payme_merchant_id, row.id, amount);
  } else {
    if (!creds.click_service_id || !creds.click_merchant_id) throw new Error("Click ulanmagan.");
    payUrl = buildClickCheckoutUrl(creds.click_service_id, creds.click_merchant_id, row.id, amount);
  }

  const { error: updateError } = await supabaseAdmin
    .from("platform_subscription_payments")
    .update({ pay_url: payUrl })
    .eq("id", row.id);
  if (updateError) throw updateError;

  return { id: row.id, payUrl };
}

// Called by both webhook handlers the instant a payment is actually
// confirmed -- reactivates the org and extends its subscription by one
// renewal period, from whichever is later: now, or its current
// trial_ends_at (so paying early never wastes remaining days).
export async function reactivateOrgAfterPayment(
  organizationId: string,
  payment: { id: string; amount: number } | null = null,
): Promise<void> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("trial_ends_at")
    .eq("id", organizationId)
    .maybeSingle();

  const now = Date.now();
  const currentEnd = org?.trial_ends_at ? new Date(org.trial_ends_at).getTime() : now;
  const base = Math.max(now, currentEnd);
  const newEnd = new Date(base + RENEWAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("organizations")
    .update({ active: true, trial_ends_at: newEnd })
    .eq("id", organizationId);

  // A first real payment ends the free trial for good -- from here on the org
  // gets its plan's full feature set (see orgPhase in org-access.ts). Kept a
  // separate update so that, if 20261015000000_trial_mode.sql hasn't been
  // run yet and the column doesn't exist, it's only this that fails -- never
  // the reactivation above, which is what actually unfreezes the org.
  await supabaseAdmin.from("organizations").update({ is_trial: false }).eq("id", organizationId);

  // Taklif dasturi: the inviting company's free days / a partner's commission.
  await rewardReferral(organizationId, payment);
}
