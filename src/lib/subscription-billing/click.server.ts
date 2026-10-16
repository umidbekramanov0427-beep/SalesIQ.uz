// Server-only. Click (click.uz) integration for the PLATFORM's own
// subscription billing -- see payme.server.ts's header for the same
// caveat (implemented from Click's public docs, never exercised against
// their real sandbox from this environment).
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reactivateOrgAfterPayment } from "./billing-data.server";

export function buildClickCheckoutUrl(
  serviceId: string,
  merchantId: string,
  orderId: string,
  amountSom: number,
): string {
  const params = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: String(amountSom),
    transaction_param: orderId,
  });
  return `https://my.click.uz/services/pay?${params.toString()}`;
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export type ClickCallbackParams = {
  click_trans_id: string;
  service_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  sign_time: string;
  sign_string: string;
  error: string;
};

function verifyPrepareSign(p: ClickCallbackParams, secretKey: string): boolean {
  const expected = md5(
    `${p.click_trans_id}${p.service_id}${secretKey}${p.merchant_trans_id}${p.amount}${p.action}${p.sign_time}`,
  );
  return expected === p.sign_string;
}

function verifyCompleteSign(p: ClickCallbackParams, secretKey: string): boolean {
  const expected = md5(
    `${p.click_trans_id}${p.service_id}${secretKey}${p.merchant_trans_id}${p.merchant_prepare_id ?? ""}${p.amount}${p.action}${p.sign_time}`,
  );
  return expected === p.sign_string;
}

type PaymentRow = {
  id: string;
  organization_id: string;
  amount: number;
  status: string;
  provider_transaction_id: string | null;
};

async function findById(id: string): Promise<PaymentRow | null> {
  const { data } = await supabaseAdmin
    .from("platform_subscription_payments")
    .select("*")
    .eq("id", id)
    .eq("provider", "click")
    .maybeSingle();
  return (data as PaymentRow | null) ?? null;
}

export async function handleClickPrepare(
  secretKey: string,
  p: ClickCallbackParams,
): Promise<Record<string, unknown>> {
  if (!verifyPrepareSign(p, secretKey)) {
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      error: -1,
      error_note: "SIGN CHECK FAILED!",
    };
  }
  const row = await findById(p.merchant_trans_id);
  if (!row) {
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      error: -5,
      error_note: "Order not found",
    };
  }
  if (row.status === "paid") {
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      error: -4,
      error_note: "Already paid",
    };
  }
  if (Math.round(row.amount) !== Math.round(Number(p.amount))) {
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      error: -2,
      error_note: "Incorrect amount",
    };
  }

  await supabaseAdmin
    .from("platform_subscription_payments")
    .update({
      provider_transaction_id: p.click_trans_id,
      provider_data: { prepared_at: Date.now() },
    })
    .eq("id", row.id);

  return {
    click_trans_id: p.click_trans_id,
    merchant_trans_id: p.merchant_trans_id,
    merchant_prepare_id: row.id,
    error: 0,
    error_note: "Success",
  };
}

export async function handleClickComplete(
  secretKey: string,
  p: ClickCallbackParams,
): Promise<Record<string, unknown>> {
  if (!verifyCompleteSign(p, secretKey)) {
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      error: -1,
      error_note: "SIGN CHECK FAILED!",
    };
  }
  const row = await findById(p.merchant_trans_id);
  if (
    !row ||
    row.provider_transaction_id !== p.click_trans_id ||
    p.merchant_prepare_id !== row.id
  ) {
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      error: -6,
      error_note: "Transaction not found",
    };
  }

  if (Number(p.error) < 0) {
    await supabaseAdmin
      .from("platform_subscription_payments")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    return {
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      merchant_confirm_id: row.id,
      error: 0,
      error_note: "Success",
    };
  }

  if (row.status !== "paid") {
    await supabaseAdmin
      .from("platform_subscription_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", row.id);
    await reactivateOrgAfterPayment(row.organization_id, {
      id: row.id,
      amount: Number(row.amount),
    });
  }

  return {
    click_trans_id: p.click_trans_id,
    merchant_trans_id: p.merchant_trans_id,
    merchant_confirm_id: row.id,
    error: 0,
    error_note: "Success",
  };
}
