import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setChatReaction } from "@/lib/telegram/lead-chat.server";
import { CHAT_REACTIONS } from "@/lib/telegram/reactions";

// POST /telegram/react { messageId, emoji | null } -> puts the team's
// reaction on a client's message in Telegram (null takes it off) and
// remembers it on the message.
export const Route = createFileRoute("/telegram/react")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          messageId?: unknown;
          emoji?: unknown;
        };
        const messageId = typeof body.messageId === "string" ? body.messageId : "";
        const emoji =
          typeof body.emoji === "string" &&
          (CHAT_REACTIONS as readonly string[]).includes(body.emoji)
            ? body.emoji
            : null;
        const { data: msg } = await supabaseAdmin
          .from("lead_telegram_messages")
          .select("id, lead_id, direction, tg_message_id")
          .eq("id", messageId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!msg || msg.direction !== "in") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const { data: link } = await supabaseAdmin
          .from("lead_telegram_links")
          .select("chat_id")
          .eq("lead_id", msg.lead_id)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        // Older messages were saved without their Telegram id: the reaction
        // then stays in the app only.
        if (link && msg.tg_message_id) {
          await setChatReaction(link.chat_id, msg.tg_message_id, emoji).catch(() => false);
        }
        const { error } = await supabaseAdmin
          .from("lead_telegram_messages")
          .update({ reaction: emoji })
          .eq("id", msg.id);
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ ok: true, reaction: emoji });
      },
    },
  },
});
