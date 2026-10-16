import { createFileRoute } from "@tanstack/react-router";
import type { ClickCallbackParams } from "@/lib/subscription-billing/click.server";
import { loadMerchant } from "@/lib/lead-payments/merchant.server";
import { handleLeadClickComplete, handleLeadClickPrepare } from "@/lib/lead-payments/click.server";

// POST /lead-payments/click/<organization id> -- the Prepare and Complete
// URL a company enters in its own Click merchant cabinet (both the same).
export const Route = createFileRoute("/lead-payments/click/$orgId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const form = await request.formData().catch(() => null);
        if (!form) return Response.json({ error: -8, error_note: "Error in request from Click" });
        const get = (key: string) => String(form.get(key) ?? "");
        const p: ClickCallbackParams = {
          click_trans_id: get("click_trans_id"),
          service_id: get("service_id"),
          merchant_trans_id: get("merchant_trans_id"),
          ...(form.get("merchant_prepare_id")
            ? { merchant_prepare_id: get("merchant_prepare_id") }
            : {}),
          amount: get("amount"),
          action: get("action"),
          sign_time: get("sign_time"),
          sign_string: get("sign_string"),
          error: get("error") || "0",
        };
        const merchant = /^[0-9a-f-]{36}$/i.test(params.orgId)
          ? await loadMerchant(params.orgId)
          : null;
        if (!merchant?.clickKey || merchant.clickServiceId !== p.service_id) {
          return Response.json({
            click_trans_id: p.click_trans_id,
            merchant_trans_id: p.merchant_trans_id,
            error: -8,
            error_note: "Click is not connected",
          });
        }
        const result =
          p.action === "0"
            ? await handleLeadClickPrepare(params.orgId, merchant.clickKey, p)
            : await handleLeadClickComplete(params.orgId, merchant.clickKey, p);
        return Response.json(result);
      },
    },
  },
});
