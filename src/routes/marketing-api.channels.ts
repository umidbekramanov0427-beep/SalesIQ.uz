import { createFileRoute } from "@tanstack/react-router";
import { requireMarketingMember } from "@/lib/marketing.server";
import { addChannel, refreshChannels } from "@/lib/marketing-live.server";

// POST /marketing-api/channels {action: "add", channel: "@name"} -> connects
// a public Telegram channel (the bot reads it); {action: "refresh", id} ->
// reads its subscriber count now. Marketing people only.
export const Route = createFileRoute("/marketing-api/channels")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          channel?: string;
          id?: string;
        };
        try {
          if (body.action === "add") {
            return Response.json(
              await addChannel(caller.organizationId, caller.id, body.channel ?? ""),
            );
          }
          if (body.action === "refresh" && body.id) {
            const n = await refreshChannels({ orgId: caller.organizationId, id: body.id });
            return Response.json({ refreshed: n });
          }
          return Response.json({ error: "Bad request" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
