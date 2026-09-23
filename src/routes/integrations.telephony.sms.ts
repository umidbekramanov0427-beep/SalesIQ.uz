import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { sendSms } from "@/lib/telephony/telephony-data.server";

type Body = { toNumber?: unknown; message?: unknown; leadId?: unknown; contactId?: unknown };

export const Route = createFileRoute("/integrations/telephony/sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const member = await requireOrgMember(request);
          if (!member) return Response.json({ error: "Unauthorized" }, { status: 403 });
          const body = (await request.json().catch(() => ({}))) as Body;
          const toNumber = typeof body.toNumber === "string" ? body.toNumber : "";
          const message = typeof body.message === "string" ? body.message : "";
          if (!toNumber || !message) {
            return Response.json({ error: "Telefon raqami va matn shart." }, { status: 400 });
          }
          const result = await sendSms(
            member.organizationId,
            member.id,
            toNumber,
            message,
            typeof body.leadId === "string" ? body.leadId : null,
            typeof body.contactId === "string" ? body.contactId : null,
          );
          return Response.json(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "SMS yuborib bo'lmadi.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
