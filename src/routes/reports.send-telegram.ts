import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";

const MAX_TEXT = 3500;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "Guruhga yuborish" in the daily report window: posts the manager's report
// text through the platform's bot into the company's report group -- one
// of its own bound chats, never an arbitrary chat id from the request.
export const Route = createFileRoute("/reports/send-telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { text?: unknown };
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return Response.json({ error: "Hisobot matni bo'sh." }, { status: 400 });
        if (text.length > MAX_TEXT) {
          return Response.json({ error: "Hisobot juda uzun." }, { status: 400 });
        }

        const [{ data: settings }, { data: chats }] = await Promise.all([
          supabaseAdmin
            .from("org_general_settings")
            .select("manager_report_chat_id")
            .eq("organization_id", caller.organizationId)
            .maybeSingle(),
          supabaseAdmin
            .from("telegram_bound_chats")
            .select("chat_id, title")
            .eq("organization_id", caller.organizationId),
        ]);
        const list = chats ?? [];
        const picked = settings?.manager_report_chat_id ?? null;
        const chat = picked
          ? list.find((c) => c.chat_id === picked)
          : list.length === 1
            ? list[0]
            : undefined;
        if (!chat) {
          return Response.json(
            { error: "Hisobot yuboriladigan Telegram guruhi tanlanmagan." },
            { status: 409 },
          );
        }

        try {
          await sendTelegramMessage(chat.chat_id, escapeHtml(text));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json(
            {
              error: /chat not found|kicked|not a member|forbidden/i.test(message)
                ? "Bot guruhda yo'q yoki chiqarib yuborilgan. Botni guruhga qayta qo'shing."
                : "Telegram'ga yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.",
            },
            { status: 502 },
          );
        }
        return Response.json({ ok: true, chat: chat.title });
      },
    },
  },
});
