import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { sendBulkMessage, type BulkMessageChannel } from "@/lib/bulk-message.server";

type Body = {
  leadIds?: unknown;
  channel?: unknown;
  text?: unknown;
  subject?: unknown;
};

const CHANNELS: BulkMessageChannel[] = ["sms", "whatsapp", "telegram", "email"];
const MAX_RECIPIENTS = 500;

export const Route = createFileRoute("/bulk-message/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadIds = Array.isArray(body.leadIds)
          ? body.leadIds.filter((id): id is string => typeof id === "string")
          : [];
        const channel = CHANNELS.includes(body.channel as BulkMessageChannel)
          ? (body.channel as BulkMessageChannel)
          : null;
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (leadIds.length === 0 || !channel || !text) {
          return Response.json(
            { error: "leadIds, channel and text are all required." },
            { status: 400 },
          );
        }
        if (leadIds.length > MAX_RECIPIENTS) {
          return Response.json(
            { error: `Bir martada eng ko'pi bilan ${MAX_RECIPIENTS} lidga yuborish mumkin.` },
            { status: 400 },
          );
        }

        const subject = typeof body.subject === "string" ? body.subject : null;
        const results = await sendBulkMessage(caller.organizationId, caller.id, leadIds, channel, {
          text,
          ...(subject !== null ? { subject } : {}),
        });
        const sent = results.filter((r) => r.ok).length;
        return Response.json({ sent, failed: results.length - sent, results });
      },
    },
  },
});
