import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { listOutgoingWebhookDeliveries } from "@/lib/webhooks/outgoing-webhooks.server";

export const Route = createFileRoute("/integrations/webhook-destinations/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const deliveries = await listOutgoingWebhookDeliveries(admin.organizationId, 20);
          return Response.json({ deliveries }, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not load history.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
