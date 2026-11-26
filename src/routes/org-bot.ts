import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember, requireSuperAdmin } from "@/lib/auth.server";
import {
  connectOrgBot,
  disconnectOrgBot,
  orgBotStatus,
  reconnectOrgBot,
  setOrgBotDefault,
  setOrgBotNewSubscriberLead,
} from "@/lib/telegram/org-bot.server";

// The company's own Telegram bot (Integratsiyalar -> Telegram bot):
//   GET  /org-bot  -> OrgBotStatus (any member: the salesbot page shows the link)
//   POST /org-bot  {action: "connect", token} | {action: "default", salesbotId}
//                  | {action: "newSubscriberLead", on} | {action: "reconnect"}
//                  | {action: "disconnect"}  (company admin)
export const Route = createFileRoute("/org-bot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireOrgMember(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json(await orgBotStatus(me.organizationId));
      },
      POST: async ({ request }) => {
        const me = await requireSuperAdmin(request);
        if (!me) return Response.json({ error: "Faqat kompaniya admini" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          token?: string;
          salesbotId?: string | null;
          on?: boolean;
        };
        try {
          if (body.action === "connect") {
            const r = await connectOrgBot(me.organizationId, body.token ?? "");
            return Response.json({ ok: true, ...r });
          }
          if (body.action === "default") {
            await setOrgBotDefault(me.organizationId, body.salesbotId || null);
            return Response.json({ ok: true });
          }
          if (body.action === "newSubscriberLead") {
            await setOrgBotNewSubscriberLead(me.organizationId, body.on !== false);
            return Response.json({ ok: true });
          }
          if (body.action === "reconnect") {
            await reconnectOrgBot(me.organizationId);
            return Response.json({ ok: true });
          }
          if (body.action === "disconnect") {
            await disconnectOrgBot(me.organizationId);
            return Response.json({ ok: true });
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json(
            {
              error: /org_telegram_bots|new_subscriber_lead/.test(msg)
                ? "Bu imkoniyat bazani yangilagandan keyin ishlaydi."
                : msg,
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
