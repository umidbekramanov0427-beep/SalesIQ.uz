import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  handleClickComplete,
  handleClickPrepare,
  type ClickCallbackParams,
} from "@/lib/subscription-billing/click.server";

// One fixed URL, configured once in the platform's own Click merchant
// cabinet -- only one merchant account exists here, so no ?org= routing.
export const Route = createFileRoute("/subscription-payments/click/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json({ error: -8, error_note: "Error in request from Click" });
        }

        const get = (key: string) => String(form.get(key) ?? "");
        const params: ClickCallbackParams = {
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

        const { data: creds } = await supabaseAdmin
          .from("platform_payment_credentials")
          .select("click_secret_key")
          .eq("id", true)
          .maybeSingle();
        if (!creds?.click_secret_key) {
          return Response.json({
            click_trans_id: params.click_trans_id,
            merchant_trans_id: params.merchant_trans_id,
            error: -8,
            error_note: "Click is not connected",
          });
        }

        const result =
          params.action === "0"
            ? await handleClickPrepare(creds.click_secret_key, params)
            : await handleClickComplete(creds.click_secret_key, params);

        return Response.json(result);
      },
    },
  },
});
