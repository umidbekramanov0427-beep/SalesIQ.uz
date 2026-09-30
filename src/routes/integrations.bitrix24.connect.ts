import { createFileRoute } from "@tanstack/react-router";
import { registerEventHandlers, saveConnection } from "@/lib/bitrix24/client.server";
import { requireSuperAdmin } from "@/lib/auth.server";

// Unlike AmoCRM's OAuth redirect dance, Bitrix24's "incoming webhook" is a
// single URL the org's own admin copies out of their portal settings and
// pastes here -- so this is a plain POST with a JSON body, not a GET
// redirect to a third party.
export const Route = createFileRoute("/integrations/bitrix24/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin)
          return Response.json({ error: "Only admins can connect Bitrix24." }, { status: 403 });

        try {
          const body = (await request.json()) as { webhookUrl?: string };
          if (!body.webhookUrl || typeof body.webhookUrl !== "string") {
            return Response.json({ error: "Webhook URL is required." }, { status: 400 });
          }
          const connection = await saveConnection(admin.organizationId, body.webhookUrl, admin.id);

          // Best-effort: registers our webhook endpoint with Bitrix24's own
          // event subscription API so deal changes push to us in near real
          // time. Never block the connection on this -- the 5-minute cron
          // sync still catches up everything without it.
          registerEventHandlers(connection).catch((err: unknown) => {
            console.error("Bitrix24 event.bind failed", err);
          });

          return Response.json({ ok: true, portalDomain: connection.portal_domain });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not connect to Bitrix24.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
