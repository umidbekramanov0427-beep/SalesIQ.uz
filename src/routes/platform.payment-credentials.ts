import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getPlatformPaymentCredentials,
  savePlatformPaymentSettings,
} from "@/lib/subscription-billing/billing-data.server";

type Body = {
  priceStartIqUzs?: unknown;
  priceAnalystIqUzs?: unknown;
  priceMasterIqUzs?: unknown;
  extraSeatPriceUzs?: unknown;
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
          .select(
            "price_start_iq_uzs, price_analyst_iq_uzs, price_master_iq_uzs, extra_seat_price_uzs",
          )
          .eq("id", true)
          .maybeSingle();
        return Response.json({
          priceStartIqUzs: settings?.price_start_iq_uzs ?? 0,
          priceAnalystIqUzs: settings?.price_analyst_iq_uzs ?? 0,
          priceMasterIqUzs: settings?.price_master_iq_uzs ?? 0,
          extraSeatPriceUzs: settings?.extra_seat_price_uzs ?? 0,
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
            priceStartIqUzs:
              typeof body.priceStartIqUzs === "number" ? body.priceStartIqUzs : undefined,
            priceAnalystIqUzs:
              typeof body.priceAnalystIqUzs === "number" ? body.priceAnalystIqUzs : undefined,
            priceMasterIqUzs:
              typeof body.priceMasterIqUzs === "number" ? body.priceMasterIqUzs : undefined,
            extraSeatPriceUzs:
              typeof body.extraSeatPriceUzs === "number" ? body.extraSeatPriceUzs : undefined,
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
