import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatFileType, downloadChatFile } from "@/lib/telegram/lead-chat.server";
import {
  accountForOrg,
  fetchClientProfile,
  fetchInstagramMedia,
} from "@/lib/instagram/instagram.server";

// An Instagram client's photo: the CDN link remembered on the chat link,
// looked up again once it has expired.
async function instagramAvatar(organizationId: string, leadId: string): Promise<Response | null> {
  const { data: link } = await supabaseAdmin
    .from("lead_instagram_links")
    .select("igsid, photo_url")
    .eq("lead_id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!link) return null;
  let got = link.photo_url ? await fetchInstagramMedia(link.photo_url) : null;
  if (!got) {
    const account = await accountForOrg(organizationId);
    const profile = account ? await fetchClientProfile(account.token, link.igsid) : null;
    if (profile?.photo && profile.photo !== link.photo_url) {
      await supabaseAdmin
        .from("lead_instagram_links")
        .update({ photo_url: profile.photo })
        .eq("lead_id", leadId);
      got = await fetchInstagramMedia(profile.photo);
    }
  }
  if (!got) return null;
  return new Response(got.data, {
    headers: { "content-type": got.type, "cache-control": "private, max-age=86400" },
  });
}

// GET /telegram/lead-avatar?leadId=... -> the client's Telegram profile
// photo (remembered on the chat link by the webhook), else their Instagram
// photo, 404 when there is none. Only for members of the lead's company.
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
        const file = link?.photo_file_id ? await downloadChatFile(link.photo_file_id) : null;
        if (!file) {
          const ig = await instagramAvatar(caller.organizationId, leadId).catch(() => null);
          return ig ?? Response.json({ error: "Not found" }, { status: 404 });
        }
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
