import { createFileRoute } from "@tanstack/react-router";
import { verifyPaymeAuth, type PaymeJsonRpcRequest } from "@/lib/subscription-billing/payme.server";
import { loadMerchant } from "@/lib/lead-payments/merchant.server";
import { handleLeadPaymeRequest } from "@/lib/lead-payments/payme.server";

// POST /lead-payments/payme/<organization id> -- the endpoint a company
// enters in its own Payme business cabinet. Authenticated by the cashbox
// key (Basic Paycom:<key>), which only that company's Payme knows.
export const Route = createFileRoute("/lead-payments/payme/$orgId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = (await request.json().catch(() => null)) as PaymeJsonRpcRequest | null;
        const id = body?.id ?? null;
        if (!body?.method) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32600, message: "Invalid request" },
          });
        }
        const merchant = /^[0-9a-f-]{36}$/i.test(params.orgId)
          ? await loadMerchant(params.orgId)
          : null;
        if (
          !merchant?.paymeKey ||
          !verifyPaymeAuth(request.headers.get("authorization"), merchant.paymeKey)
        ) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32504, message: "Insufficient privilege to perform this method" },
          });
        }
        const result = await handleLeadPaymeRequest(params.orgId, body);
        return Response.json({ jsonrpc: "2.0", id, ...result });
      },
    },
  },
});
