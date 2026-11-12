import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Platforma -> Botlar: the platform's three Telegram bots.
//   GET  -> { ready, bots: { client|staff|ops: { username, source, webhook, webhookError } },
//             staffChats }
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
        };
        if (body.kind !== "staff" && body.kind !== "ops")
          return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
        const b = await import("@/lib/bot-tokens.server");
        if (b.botTokenSource(body.kind) === "env")
          return Response.json(
            { error: "Bu bot tokeni serverda (.env.server) o'rnatilgan — u yerda o'zgartiriladi" },
            { status: 400 },
          );
        try {
          const r = await b.saveBotToken(body.kind, body.token?.trim() || null);
          // Point the bot at our webhook right away.
          const origin = new URL(request.url).origin;
          if (body.kind === "staff") await b.ensureStaffBot(origin).catch(() => undefined);
          else {
            const { ensureOpsBot } = await import("@/lib/ops/bot.server");
            await ensureOpsBot().catch(() => undefined);
          }
          return Response.json({ ok: true, username: r.username });
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
