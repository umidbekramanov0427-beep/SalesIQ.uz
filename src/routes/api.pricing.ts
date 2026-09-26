import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public, unauthenticated by design -- the marketing landing page (shown to
// logged-out visitors on "/", see __root.tsx's AuthGate) needs the live
// subscription price to advertise it, but platform_settings' own RLS select
// policy only covers `authenticated`, not `anon`. This is the one field of
// that row a logged-out visitor is meant to see, so it goes through its own
// tiny read-only endpoint via the admin client rather than widening the RLS
// policy itself.
export const Route = createFileRoute("/api/pricing")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("platform_settings")
          .select("subscription_price_uzs")
          .eq("id", true)
          .maybeSingle();
        return Response.json({ priceUzs: data?.subscription_price_uzs ?? 0 });
      },
    },
  },
});
