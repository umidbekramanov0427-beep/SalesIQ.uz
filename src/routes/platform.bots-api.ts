import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Platforma -> Botlar: the platform's three Telegram bots.
//   GET  -> { ready, bots: { client|staff|ops: { username, source, webhook, webhookError } },
//             staffChats }
//   POST {kind, action: "reconnect"}  points the bot at our server again ->
//        { ok, webhookError }.
//   POST {kind: "staff" | "ops", token: string | null}  saves (checked with
//        Telegram, sealed) or removes the bot's token. A token set on the
//        server (STAFF_/OPS_TELEGRAM_BOT_TOKEN) wins and cannot be changed here.
export const Route = createFileRoute("/platform/bots-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = await import("@/lib/bot-tokens.server");
        await b.refreshBotTokens(true);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const probe = await supabaseAdmin.from("platform_private").select("id").limit(1);
        const kinds = ["client", "staff", "ops"] as const;
        const entries = await Promise.all(
          kinds.map(async (k) => {
            const [username, hook] = await Promise.all([b.botUsername(k), b.botWebhook(k)]);
            return [
              k,
              {
                username,
                source: b.botTokenSource(k),
                webhook: hook.url,
                webhookError: hook.error,
              },
            ] as const;
          }),
        );
        return Response.json({
          ready: !probe.error,
          bots: Object.fromEntries(entries),
          staffChats: probe.error ? 0 : await b.staffChatCount().catch(() => 0),
        });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          kind?: string;
          token?: string | null;
          action?: string;
        };
        if (body.kind !== "staff" && body.kind !== "ops")
          return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
        const b = await import("@/lib/bot-tokens.server");
        // Points the bot at our server again and says what Telegram has.
        const connect = async (kind: "staff" | "ops") => {
          if (kind === "staff") {
            const r = await b.ensureStaffBot(true);
            return r.error ?? (r.ok ? null : r.url ? `Webhook: ${r.url}` : "Webhook o'rnatilmadi");
          }
          const { ensureOpsBot, appUrl } = await import("@/lib/ops/bot.server");
          try {
            await ensureOpsBot(appUrl(), true);
          } catch (err) {
            return err instanceof Error ? err.message.slice(0, 300) : "xato";
          }
          const hook = await b.botWebhook("ops");
          return (
            hook.error ??
            (hook.url === `${appUrl()}/telegram/ops-webhook` ? null : "Webhook o'rnatilmadi")
          );
        };
        if (body.action === "reconnect") {
          if (!b.botToken(body.kind))
            return Response.json({ error: "Bot tokeni saqlanmagan" }, { status: 400 });
          const webhookError = await connect(body.kind);
          return Response.json({ ok: !webhookError, webhookError });
        }
        if (b.botTokenSource(body.kind) === "env")
          return Response.json(
            { error: "Bu bot tokeni serverda (.env.server) o'rnatilgan — u yerda o'zgartiriladi" },
            { status: 400 },
          );
        try {
          const r = await b.saveBotToken(body.kind, body.token?.trim() || null);
          // Point the bot at our webhook right away; a failure is shown.
          const webhookError = r.username ? await connect(body.kind) : null;
          return Response.json({ ok: true, username: r.username, webhookError });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message.slice(0, 200) : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
