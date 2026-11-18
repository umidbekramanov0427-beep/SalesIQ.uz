import { createFileRoute } from "@tanstack/react-router";
import { requireMarketingMember } from "@/lib/marketing.server";
import {
  connectMarketingBot,
  createChannelInvite,
  disconnectMarketingBot,
  marketingBotStatus,
  reconnectMarketingBot,
  revokeChannelInvite,
  saveMarketingBotSettings,
  staffLinkFor,
  unlinkStaff,
} from "@/lib/marketing-bot/bot.server";

// /marketing-api/bot -- Marketing -> Sozlash -> Bot.
//   GET  -> the bot, the marketing people who linked Telegram, the
//           channels and their invite links (with joins / leaves).
//   POST {action}:
//     connect {token} | reconnect | disconnect | settings {settings}  (editors)
//     link            -> a one-time t.me link that ties my Telegram (anyone with marketing access)
//     unlink {profileId}  (editors, or myself)
//     invite {channelId, name, joinRequest} | revoke {inviteId}  (editors)
const EDITORS = new Set(["super_admin", "marketolog", "platform_owner"]);

export const Route = createFileRoute("/marketing-api/bot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        try {
          return Response.json(await marketingBotStatus(caller.organizationId, caller.id));
        } catch (err) {
          console.error("[marketing-bot] status", err);
          return Response.json({ error: "Holatni o'qib bo'lmadi" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(b["action"] ?? "");
        const editor = EDITORS.has(caller.role);
        const org = caller.organizationId;
        try {
          switch (action) {
            case "link":
              return Response.json({ url: await staffLinkFor(org, caller.id) });
            case "unlink": {
              const who = String(b["profileId"] ?? caller.id);
              if (who !== caller.id && !editor)
                return Response.json({ error: "Forbidden" }, { status: 403 });
              await unlinkStaff(org, who);
              return Response.json({ ok: true });
            }
          }
          if (!editor) return Response.json({ error: "Forbidden" }, { status: 403 });
          switch (action) {
            case "connect":
              return Response.json(
                await connectMarketingBot(org, String(b["token"] ?? ""), caller.id),
              );
            case "reconnect":
              await reconnectMarketingBot(org);
              return Response.json({ ok: true });
            case "disconnect":
              await disconnectMarketingBot(org);
              return Response.json({ ok: true });
            case "settings":
              await saveMarketingBotSettings(org, b["settings"]);
              return Response.json({ ok: true });
            case "invite":
              return Response.json(
                await createChannelInvite(
                  org,
                  String(b["channelId"] ?? ""),
                  String(b["name"] ?? ""),
                  b["joinRequest"] === true,
                  caller.id,
                ),
              );
            case "revoke":
              await revokeChannelInvite(org, String(b["inviteId"] ?? ""));
              return Response.json({ ok: true });
            default:
              return Response.json({ error: "Unknown action" }, { status: 400 });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Xatolik";
          return Response.json(
            {
              error: /marketing_bot|schema cache|does not exist/i.test(msg)
                ? "migration_pending"
                : msg,
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
