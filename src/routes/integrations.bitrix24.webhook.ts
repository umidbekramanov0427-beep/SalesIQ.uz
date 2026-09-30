import { createFileRoute } from "@tanstack/react-router";
import { deleteSyncedDeal, getConnection, upsertSingleDeal } from "@/lib/bitrix24/client.server";

// Bitrix24 event.bind posts form-encoded fields, not JSON: `event`,
// `data[FIELDS][ID]`, plus an `auth[...]` block we don't need (the portal
// identity is implicit in which org's webhook URL we registered the events
// against, not something the payload has to prove -- unlike AmoCRM's classic
// webhook, there's no separate portal-identity field to cross-check here).
export const Route = createFileRoute("/integrations/bitrix24/webhook")({
  server: {
    handlers: {
      // Bitrix24 expects a fast 200 regardless of outcome, same as AmoCRM's
      // webhook. The URL registered with event.bind (see registerEventHandlers
      // in client.server.ts) carries ?org=<id>, since this endpoint serves
      // every connected organization.
      POST: async ({ request }) => {
        try {
          const organizationId = new URL(request.url).searchParams.get("org");
          if (!organizationId) return new Response("ok", { status: 200 });
          const conn = await getConnection(organizationId);
          if (!conn) return new Response("ok", { status: 200 });

          const form = await request.formData();
          const event = String(form.get("event") ?? "").toUpperCase();
          const dealId = form.get("data[FIELDS][ID]");
          if (!dealId) return new Response("ok", { status: 200 });
          const id = Number(dealId);
          if (!Number.isFinite(id)) return new Response("ok", { status: 200 });

          if (event === "ONCRMDEALDELETE") {
            await deleteSyncedDeal(id);
          } else {
            await upsertSingleDeal(organizationId, id);
          }
        } catch (err) {
          console.error("Bitrix24 webhook error", err);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
