// Server-only. Click (click.uz) merchant integration -- checkout link
// generation + the two-step Prepare/Complete webhook Click calls.
//
// IMPORTANT: implemented from Click's publicly documented merchant
// protocol (docs.click.uz) from training knowledge -- this sandbox has no
// network access to Click's own systems, so nothing here has been
// exercised against their test suite. Before accepting real payments,
// request test merchant credentials from Click support and run a full
// test payment, comparing every response field against their checklist.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function buildClickCheckoutUrl(
  serviceId: string,
  merchantId: string,
  leadPaymentId: string,
  amountSom: number,
): string {
  const params = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: String(amountSom),
    transaction_param: leadPaymentId,
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

type LeadPaymentRow = {
  id: string;
  organization_id: string;
  amount: number;
  status: string;
  provider_transaction_id: string | null;
};

async function findById(organizationId: string, id: string): Promise<LeadPaymentRow | null> {
  const { data } = await supabaseAdmin
    .from("lead_payments")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("provider", "click")
    .maybeSingle();
  return (data as LeadPaymentRow | null) ?? null;
}

// merchant_prepare_id and merchant_trans_id are both the lead_payments row
// id -- a simple-invoicing shape (one row is one order, prepared at most
// once), so no separate "prepare" record is needed beyond this table.
export async function handleClickPrepare(
  organizationId: string,
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
  const row = await findById(organizationId, p.merchant_trans_id);
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
    .from("lead_payments")
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
  organizationId: string,
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
  const row = await findById(organizationId, p.merchant_trans_id);
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
    await supabaseAdmin.from("lead_payments").update({ status: "cancelled" }).eq("id", row.id);
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
      .from("lead_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return {
    click_trans_id: p.click_trans_id,
    merchant_trans_id: p.merchant_trans_id,
    merchant_confirm_id: row.id,
    error: 0,
    error_note: "Success",
  };
}
