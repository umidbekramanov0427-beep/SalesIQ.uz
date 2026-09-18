import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";
import { AI_SETUP_QUESTIONS } from "@/lib/ai-onboarding.server";

// Starts (or restarts) the AI onboarding interview. Telegram bots can't
// message a user first, so this only pushes the greeting + first question
// when the calling admin already has a linked telegram_chat_id (from
// Settings → Telegram bot) -- otherwise it just opens the org_ai_onboarding
// row and the client tells the admin to link Telegram first.
export const Route = createFileRoute("/onboarding/ai-setup/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can start this." }, { status: 403 });
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("telegram_chat_id, full_name")
            .eq("id", admin.id)
            .maybeSingle();

          await supabaseAdmin.from("org_ai_onboarding").upsert(
            {
              organization_id: admin.organizationId,
              status: "interviewing",
              current_step: 0,
              answers: {},
              proposal: null,
              started_by: admin.id,
              started_at: new Date().toISOString(),
              telegram_chat_id: profile?.telegram_chat_id ?? null,
            },
            { onConflict: "organization_id" },
          );

          if (!profile?.telegram_chat_id) {
            return Response.json({ started: true, telegramLinked: false });
          }

          await supabaseAdmin
            .from("profiles")
            .update({ telegram_ai_setup_step: 0, telegram_ai_setup_answers: {} })
            .eq("id", admin.id);

          await sendTelegramMessage(
            profile.telegram_chat_id,
            `Salom, ${profile.full_name || "hurmatli foydalanuvchi"}! Keling, platformangizni sizga moslab sozlaymiz — bir nechta savolga javob bering. ${AI_SETUP_QUESTIONS[0]!.text}`,
          ).catch(() => undefined);

          return Response.json({ started: true, telegramLinked: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
