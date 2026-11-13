import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { workAccountError } from "@/lib/telegram-user/work-account";
import { sendWorkMessage } from "@/lib/telegram-user/work-account.server";

// POST /telegram/user-send { leadId, text } -> a reply from the lead card
// through the work Telegram account the client wrote to.
export const Route = createFileRoute("/telegram/user-send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          leadId?: unknown;
          text?: unknown;
        };
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        const text = typeof body.text === "string" ? body.text.trim().slice(0, 4096) : "";
        if (!leadId || !text) {
          return Response.json({ error: "leadId and text are required" }, { status: 400 });
        }
        try {
          await sendWorkMessage({
            orgId: caller.organizationId,
            leadId,
            senderId: caller.id,
            text,
          });
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          return Response.json(
            { error: raw.startsWith("Bu lidda") ? raw : workAccountError(raw) },
            { status: /rate_limited/.test(raw) ? 429 : 502 },
          );
        }
        return Response.json({ ok: true });
      },
    },
  },
});
