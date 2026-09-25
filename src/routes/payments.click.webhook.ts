import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  handleClickComplete,
  handleClickPrepare,
  type ClickCallbackParams,
} from "@/lib/payments/click.server";

// Same org-routing convention as payments.payme.webhook.ts -- Click is
// configured (in its merchant cabinet) with one URL per service, so it
// must include ?org=<organization_id>. The actual security boundary is
// the per-request MD5 sign (verified inside handleClickPrepare/Complete
// against the org's own secret key), not the org id itself.
export const Route = createFileRoute("/payments/click/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const organizationId = new URL(request.url).searchParams.get("org");
        const form = await request.formData().catch(() => null);
        if (!organizationId || !form) {
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
          .from("org_click_credentials")
          .select("secret_key")
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!creds) {
          return Response.json({
            click_trans_id: params.click_trans_id,
            merchant_trans_id: params.merchant_trans_id,
            error: -8,
            error_note: "Click is not connected for this organization",
          });
        }

        const result =
          params.action === "0"
            ? await handleClickPrepare(organizationId, creds.secret_key, params)
            : await handleClickComplete(organizationId, creds.secret_key, params);

        return Response.json(result);
      },
    },
  },
});
