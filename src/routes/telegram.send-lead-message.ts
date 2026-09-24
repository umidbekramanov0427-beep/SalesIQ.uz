import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram-report.server";

type Body = { leadId?: unknown; text?: unknown };

export const Route = createFileRoute("/telegram/send-lead-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!leadId || !text) {
          return Response.json({ error: "leadId and text are required" }, { status: 400 });
        }

        const { data: link } = await supabaseAdmin
          .from("lead_telegram_links")
          .select("chat_id")
          .eq("lead_id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!link) {
          return Response.json(
            { error: "This lead has no linked Telegram chat." },
            { status: 400 },
          );
        }

        try {
          await sendTelegramMessage(link.chat_id, text);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not send the message.";
          return Response.json({ error: message }, { status: 502 });
        }

        const { error } = await supabaseAdmin.from("lead_telegram_messages").insert({
          organization_id: caller.organizationId,
          lead_id: leadId,
          direction: "out",
          text,
          sent_by: caller.id,
        });
        if (error) return Response.json({ error: error.message }, { status: 400 });

        return Response.json({ ok: true });
      },
    },
  },
});
