import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTelegramBotUsername } from "@/lib/telegram-report.server";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// One-time code that binds an intern's onboarding Telegram group to them:
// add the bot to the group, send "/mentor CODE" there (handled in
// telegram.webhook.ts). The intern can request it for themself; ROP/admin
// for any intern in their org ({ internId }).
export const Route = createFileRoute("/intern-mentor/group-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { internId?: unknown };
        const internId = typeof body.internId === "string" ? body.internId : userId;

        const { data: caller } = await supabaseAdmin
          .from("profiles")
          .select("role, organization_id")
          .eq("id", userId)
          .maybeSingle();
        const { data: intern } = await supabaseAdmin
          .from("profiles")
          .select("id, organization_id, is_intern")
          .eq("id", internId)
          .maybeSingle();
        const isAdmin =
          caller?.role === "super_admin" ||
          caller?.role === "rop" ||
          caller?.role === "platform_owner";
        if (
          !caller ||
          !intern?.is_intern ||
          intern.organization_id !== caller.organization_id ||
          (internId !== userId && !isAdmin)
        ) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const code = randomCode();
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ intern_group_link_code: code })
          .eq("id", internId);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const botUsername = await getTelegramBotUsername().catch(() => null);
        return Response.json({ code, botUsername });
      },
    },
  },
});
