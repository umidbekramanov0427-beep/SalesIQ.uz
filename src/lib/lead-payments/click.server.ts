// Server-only. Click's prepare/complete callbacks for a company's own Click
// cashbox over lead_payment_links (the signature check is shared with the
// platform's subscription billing).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  verifyCompleteSign,
  verifyPrepareSign,
  type ClickCallbackParams,
} from "@/lib/subscription-billing/click.server";
import { findLink, settleLinkPaid } from "./settle.server";

const reply = (p: ClickCallbackParams, error: number, note: string, extra = {}) => ({
  click_trans_id: p.click_trans_id,
  merchant_trans_id: p.merchant_trans_id,
  ...extra,
  error,
  error_note: note,
});

export async function handleLeadClickPrepare(
  orgId: string,
  secretKey: string,
  p: ClickCallbackParams,
): Promise<Record<string, unknown>> {
  if (!verifyPrepareSign(p, secretKey)) return reply(p, -1, "SIGN CHECK FAILED!");
  const row = await findLink(orgId, p.merchant_trans_id);
  if (!row || row.status === "cancelled") return reply(p, -5, "Order not found");
  if (row.status === "paid") return reply(p, -4, "Already paid");
  if (Math.round(Number(row.amount)) !== Math.round(Number(p.amount)))
    return reply(p, -2, "Incorrect amount");
  await supabaseAdmin
    .from("lead_payment_links")
    .update({
      provider_data: {
        ...row.provider_data,
        click_trans_id: p.click_trans_id,
        click_prepared_at: Date.now(),
      },
    })
    .eq("id", row.id);
  return reply(p, 0, "Success", { merchant_prepare_id: row.id });
}

export async function handleLeadClickComplete(
  orgId: string,
  secretKey: string,
  p: ClickCallbackParams,
): Promise<Record<string, unknown>> {
  if (!verifyCompleteSign(p, secretKey)) return reply(p, -1, "SIGN CHECK FAILED!");
  const row = await findLink(orgId, p.merchant_trans_id);
  if (
    !row ||
    p.merchant_prepare_id !== row.id ||
    row.provider_data["click_trans_id"] !== p.click_trans_id
  )
    return reply(p, -6, "Transaction not found");
  // Click reports a failed payment: the link stays open for another try.
  if (Number(p.error) < 0) return reply(p, 0, "Success", { merchant_confirm_id: row.id });
  if (row.status === "paid" && row.provider !== "click") return reply(p, -4, "Already paid");
  if (row.status === "cancelled") return reply(p, -9, "Transaction cancelled");
  if (row.status !== "paid") {
    await supabaseAdmin
      .from("lead_payment_links")
      .update({ provider_transaction_id: p.click_trans_id })
      .eq("id", row.id);
    await settleLinkPaid(row, "click");
  }
  return reply(p, 0, "Success", { merchant_confirm_id: row.id });
}
