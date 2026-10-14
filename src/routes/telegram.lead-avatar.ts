import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatFileType, downloadChatFile } from "@/lib/telegram/lead-chat.server";

// GET /telegram/lead-avatar?leadId=... -> the client's Telegram profile
// photo (remembered on the chat link by the webhook), 404 when there is
// none. Only for members of the lead's company.
export const Route = createFileRoute("/telegram/lead-avatar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const leadId = new URL(request.url).searchParams.get("leadId") ?? "";
        const { data: link } = await supabaseAdmin
          .from("lead_telegram_links")
          .select("photo_file_id")
          .eq("lead_id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!link?.photo_file_id) return Response.json({ error: "Not found" }, { status: 404 });
        const file = await downloadChatFile(link.photo_file_id);
        if (!file) return Response.json({ error: "Not found" }, { status: 404 });
        return new Response(file.data, {
          headers: {
            "content-type": chatFileType("photo", file.path),
            "cache-control": "private, max-age=86400",
          },
        });
      },
    },
  },
});
