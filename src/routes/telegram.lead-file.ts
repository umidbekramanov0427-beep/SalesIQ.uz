import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatFileType, downloadChatFile } from "@/lib/telegram/lead-chat.server";

// GET /telegram/lead-file?messageId=... -> the file of one lead chat
// message (a client's photo, voice, document, ... or one the team sent),
// streamed from Telegram. Only for members of the lead's company.
export const Route = createFileRoute("/telegram/lead-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const messageId = new URL(request.url).searchParams.get("messageId") ?? "";
        const { data: msg } = await supabaseAdmin
          .from("lead_telegram_messages")
          .select("file_id, file_kind, file_name")
          .eq("id", messageId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!msg?.file_id) return Response.json({ error: "Not found" }, { status: 404 });
        const file = await downloadChatFile(msg.file_id);
        if (!file) return Response.json({ error: "file_unavailable" }, { status: 404 });
        const name = msg.file_name || file.path.split("/").pop() || "file";
        return new Response(file.data, {
          headers: {
            "content-type": chatFileType(msg.file_kind, file.path),
            "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
            "cache-control": "private, max-age=86400",
          },
        });
      },
    },
  },
});
