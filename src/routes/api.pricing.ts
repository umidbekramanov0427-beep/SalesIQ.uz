import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public, unauthenticated by design -- the marketing landing page (shown to
// logged-out visitors on "/", see __root.tsx's AuthGate) needs the live
// subscription price and the platform owner's own support contacts to
// display, but platform_settings' own RLS select policy only covers
// `authenticated`, not `anon`. These are the fields a logged-out visitor is
// meant to see (support_phone/telegram/email are the exact same ones the
// owner already sets on /platform/notifications' "Qo'llab-quvvatlash
// aloqalari" card, which every signed-in org also sees on its own /billing
// page -- this just extends that one existing setting to the public
// landing page instead of introducing a separate contact field to
// maintain), so they go through this tiny read-only endpoint via the admin
// client rather than widening the RLS policy itself.
export const Route = createFileRoute("/api/pricing")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("platform_settings")
          .select(
            "price_start_iq_uzs, price_analyst_iq_uzs, price_master_iq_uzs, support_phone, support_telegram, support_email",
          )
          .eq("id", true)
          .maybeSingle();
        return Response.json({
          priceStartIqUzs: data?.price_start_iq_uzs ?? 0,
          priceAnalystIqUzs: data?.price_analyst_iq_uzs ?? 0,
          priceMasterIqUzs: data?.price_master_iq_uzs ?? 0,
          supportPhone: data?.support_phone ?? null,
          supportTelegram: data?.support_telegram ?? null,
          supportEmail: data?.support_email ?? null,
        });
      },
    },
  },
});
