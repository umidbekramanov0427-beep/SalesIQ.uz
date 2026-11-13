import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { tgLiveConfigured } from "@/lib/tg-live.server";
import { findLeadOnTelegram } from "@/lib/telegram-user/work-account.server";

// Lead card → «Telegram'da topish»: the caller's work Telegram account finds
// the lead's client by phone and links the chat to the lead.
export const Route = createFileRoute("/telegram/user-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (!tgLiveConfigured()) {
          return Response.json(
            { error: "Telegram xizmati serverda sozlanmagan." },
            { status: 503 },
          );
        }
        const body = (await request.json().catch(() => ({}))) as { leadId?: unknown };
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        if (!leadId) return Response.json({ error: "leadId kerak" }, { status: 400 });
        try {
          const found = await findLeadOnTelegram({
            orgId: caller.organizationId,
            leadId,
            profileId: caller.id,
          });
          return Response.json({ ok: true, ...found });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
