import { createFileRoute } from "@tanstack/react-router";
import { getTelegramBotUsername } from "@/lib/telegram-report.server";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

const CODE_TTL_MS = 15 * 60 * 1000;

// Same shape as /telegram/link, but org-scoped (telegram_bind_codes is
// keyed by organization_id, not profile_id) since a group/channel isn't
// owned by a single person -- any admin/manager can generate and send the
// bind code. See telegram.webhook.ts for the /bind <code> handler.
export const Route = createFileRoute("/telegram/link-group")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: caller } = await supabaseAdmin
          .from("profiles")
          .select("role, organization_id")
          .eq("id", userId)
          .maybeSingle();
        const isAdmin =
          caller?.role === "super_admin" ||
          caller?.role === "rop" ||
          caller?.role === "platform_owner";
        if (!isAdmin || !caller.organization_id) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const code = randomCode();
        const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        const { error } = await supabaseAdmin.from("telegram_bind_codes").upsert(
          {
            organization_id: caller.organization_id,
            code,
            created_by: userId,
            expires_at: expiresAt,
          },
          { onConflict: "organization_id" },
        );
        if (error) return Response.json({ error: error.message }, { status: 400 });

        const { data: botSetting } = await supabaseAdmin
          .from("integration_settings")
          .select("config")
          .eq("organization_id", caller.organization_id)
          .eq("key", "telegram_bot")
          .maybeSingle();
        const config = (botSetting?.config ?? {}) as { username?: string };
        // The platform's shared bot when the org hasn't set its own.
        const botUsername =
          config.username ?? (await getTelegramBotUsername().catch(() => null)) ?? null;

        return Response.json({ code, botUsername, expiresAt });
      },
    },
  },
});
