import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  handlePaymeRequest,
  verifyPaymeAuth,
  type PaymeJsonRpcRequest,
} from "@/lib/payments/payme.server";

// Payme calls one fixed URL per merchant account (configured in their
// business cabinet) -- since this app is multi-tenant, that URL must
// include ?org=<organization_id> so we know whose secret key to check,
// same convention as integrations.amocrm.webhook.ts. Unlike that endpoint,
// the actual security boundary here is Payme's own Basic-auth secret key,
// not the org id itself -- a wrong/missing key is rejected before any
// lead_payments row is touched.
export const Route = createFileRoute("/payments/payme/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const organizationId = new URL(request.url).searchParams.get("org");
        const body = (await request.json().catch(() => null)) as PaymeJsonRpcRequest | null;
        const id = body?.id ?? null;

        if (!organizationId || !body?.method) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32600, message: "Invalid request" },
          });
        }

        const { data: creds } = await supabaseAdmin
          .from("org_payme_credentials")
          .select("secret_key")
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!creds || !verifyPaymeAuth(request.headers.get("authorization"), creds.secret_key)) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32504, message: "Insufficient privilege to perform this method" },
          });
        }

        const result = await handlePaymeRequest(organizationId, body);
        return Response.json({ jsonrpc: "2.0", id, ...result });
      },
    },
  },
});
