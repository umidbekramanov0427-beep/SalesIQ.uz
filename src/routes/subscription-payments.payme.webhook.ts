import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  handlePaymeRequest,
  verifyPaymeAuth,
  type PaymeJsonRpcRequest,
} from "@/lib/subscription-billing/payme.server";

// One fixed URL, configured once in the platform's own Payme business
// cabinet -- unlike the (now-removed) per-lead version, there's only ever
// one merchant account here, so no ?org= routing is needed.
export const Route = createFileRoute("/subscription-payments/payme/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as PaymeJsonRpcRequest | null;
        const id = body?.id ?? null;

        if (!body?.method) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32600, message: "Invalid request" },
          });
        }

        const { data: creds } = await supabaseAdmin
          .from("platform_payment_credentials")
          .select("payme_secret_key")
          .eq("id", true)
          .maybeSingle();
        if (
          !creds?.payme_secret_key ||
          !verifyPaymeAuth(request.headers.get("authorization"), creds.payme_secret_key)
        ) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32504, message: "Insufficient privilege to perform this method" },
          });
        }

        const result = await handlePaymeRequest(body);
        return Response.json({ jsonrpc: "2.0", id, ...result });
      },
    },
  },
});
