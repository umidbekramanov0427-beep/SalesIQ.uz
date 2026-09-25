import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { sendWhatsAppToLead } from "@/lib/whatsapp/whatsapp-data.server";

type Body = { leadId?: unknown; text?: unknown };

export const Route = createFileRoute("/whatsapp/send-lead-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!leadId || !text) {
          return Response.json({ error: "leadId and text are required" }, { status: 400 });
        }

        try {
          const result = await sendWhatsAppToLead(caller.organizationId, caller.id, leadId, text);
          return Response.json(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not send the message.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
