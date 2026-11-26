import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Platforma -> Botlar: the platform's three Telegram bots.
//   GET  -> { ready, bots: { client|staff|ops: { username, source, hasEnv,
//             webhook, webhookError } }, staffChats, trialOrgs, orgBots }
//   POST {kind, action: "reconnect"}  points the bot at our server again ->
//        { ok, webhookError }.
//   POST {kind: "client" | "staff" | "ops", token: string | null}  saves
//        (checked with Telegram, sealed) or removes the bot's panel token.
//        The panel token wins over the server setting (.env.server), which
//        stays as the fallback when the panel token is removed.
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
                hasEnv: b.botHasEnvToken(k),
                webhook: hook.url,
                webhookError: hook.error,
              },
            ] as const;
          }),
        );
        // Companies on the shared trial bot (still taking new clients) and
        // companies with a bot of their own; zero before the migration.
        const nowIso = new Date().toISOString();
        const [trial, own] = await Promise.all([
          supabaseAdmin
            .from("organizations")
            .select("id", { count: "exact", head: true })
            .gt("shared_bot_until", nowIso),
          supabaseAdmin.from("org_telegram_bots").select("organization_id", {
            count: "exact",
            head: true,
          }),
        ]);
        return Response.json({
          ready: !probe.error,
          bots: Object.fromEntries(entries),
          staffChats: probe.error ? 0 : await b.staffChatCount().catch(() => 0),
          trialOrgs: trial.error ? 0 : (trial.count ?? 0),
          orgBots: own.error ? 0 : (own.count ?? 0),
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
        if (body.kind !== "client" && body.kind !== "staff" && body.kind !== "ops")
          return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
        const b = await import("@/lib/bot-tokens.server");
        // Points the bot at our server again and says what Telegram has.
        const connect = async (kind: "client" | "staff" | "ops") => {
          if (kind === "client") {
            const r = await b.ensureClientBot(true);
            return r.error ?? (r.ok ? null : r.url ? `Webhook: ${r.url}` : "Webhook o'rnatilmadi");
          }
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
        try {
          const r = await b.saveBotToken(body.kind, body.token?.trim() || null);
          // Point the bot at our webhook right away; a failure is shown.
          // Removed from the panel: the server setting (if any) takes over again.
          const webhookError =
            r.username || b.botToken(body.kind) ? await connect(body.kind) : null;
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
