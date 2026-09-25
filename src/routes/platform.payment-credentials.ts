import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getPlatformPaymentCredentials,
  savePlatformPaymentSettings,
} from "@/lib/subscription-billing/billing-data.server";

type Body = {
  priceUzs?: unknown;
  paymeMerchantId?: unknown;
  paymeSecretKey?: unknown;
  clickServiceId?: unknown;
  clickMerchantId?: unknown;
  clickSecretKey?: unknown;
};

// platform_owner-only -- the org-facing status any authenticated user can
// read lives at /subscription-payments/status instead, and never exposes
// the secret keys this route returns.
export const Route = createFileRoute("/platform/payment-credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const creds = await getPlatformPaymentCredentials();
        const { data: settings } = await supabaseAdmin
          .from("platform_settings")
          .select("subscription_price_uzs")
          .eq("id", true)
          .maybeSingle();
        return Response.json({
          priceUzs: settings?.subscription_price_uzs ?? 0,
          paymeMerchantId: creds?.payme_merchant_id ?? "",
          paymeSecretKeySet: !!creds?.payme_secret_key,
          clickServiceId: creds?.click_service_id ?? "",
          clickMerchantId: creds?.click_merchant_id ?? "",
          clickSecretKeySet: !!creds?.click_secret_key,
        });
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Body;
        try {
          await savePlatformPaymentSettings(ownerId, {
            priceUzs: typeof body.priceUzs === "number" ? body.priceUzs : undefined,
            paymeMerchantId:
              typeof body.paymeMerchantId === "string" ? body.paymeMerchantId.trim() : undefined,
            paymeSecretKey:
              typeof body.paymeSecretKey === "string" && body.paymeSecretKey.trim()
                ? body.paymeSecretKey.trim()
                : undefined,
            clickServiceId:
              typeof body.clickServiceId === "string" ? body.clickServiceId.trim() : undefined,
            clickMerchantId:
              typeof body.clickMerchantId === "string" ? body.clickMerchantId.trim() : undefined,
            clickSecretKey:
              typeof body.clickSecretKey === "string" && body.clickSecretKey.trim()
                ? body.clickSecretKey.trim()
                : undefined,
          });
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
