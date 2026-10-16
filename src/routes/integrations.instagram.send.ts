import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readBulkUpload } from "@/lib/bulk-uploads.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import {
  accountForOrg,
  attachmentTypeFor,
  sendErrorMessage,
  sendInstagramAttachment,
  sendInstagramText,
  stageOutgoingFile,
  STORAGE_PREFIX,
} from "@/lib/instagram/instagram.server";

// POST /integrations/instagram/send { leadId, text?, files? } -> a reply to
// the lead's Instagram Direct chat from the lead card. Files go as
// Instagram attachments (photo, video, audio, PDF) through a short-lived
// Storage link; each piece is saved in the lead's chat history.

type Body = { leadId?: unknown; text?: unknown; files?: unknown };
type RawFile = { name?: unknown; type?: unknown; base64?: unknown; path?: unknown };

const MAX_FILES = 10;
const MAX_INLINE_BYTES = 3 * 1024 * 1024;
const FILE_KIND = { image: "photo", video: "video", audio: "voice", file: "document" } as const;

// Instagram may echo the reply back to the webhook before it is saved here;
// then the echo's row just gets its author.
async function saveOut(row: Parameters<typeof insertLeadChatMessage>[0]): Promise<void> {
  try {
    await insertLeadChatMessage(row);
  } catch (err) {
    const msg = (err as { message?: string } | null)?.message ?? "";
    if (!row.ext_message_id || !/duplicate|unique/i.test(msg)) throw err;
    await supabaseAdmin
      .from("lead_telegram_messages")
      .update({ sent_by: row.sent_by ?? null })
      .eq("ext_message_id", row.ext_message_id)
      .eq("organization_id", row.organization_id);
  }
}

export const Route = createFileRoute("/integrations/instagram/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Body;
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const rawFiles = (Array.isArray(body.files) ? body.files : []) as RawFile[];
        if (!leadId || (!text && rawFiles.length === 0)) {
          return Response.json(
            { error: "leadId and text (or a file) are required" },
            { status: 400 },
          );
        }
        if (rawFiles.length > MAX_FILES) {
          return Response.json(
            { error: `Eng ko'pi bilan ${MAX_FILES} ta fayl yuborish mumkin.` },
            { status: 400 },
          );
        }

        const { data: link } = await supabaseAdmin
          .from("lead_instagram_links")
          .select("igsid, ig_user_id")
          .eq("lead_id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!link) {
          return Response.json({ error: "Bu lidda Instagram suhbati yo'q." }, { status: 400 });
        }
        const account = await accountForOrg(caller.organizationId);
        if (!account || account.ig_user_id !== link.ig_user_id) {
          return Response.json(
            { error: "Instagram ulanmagan — Integratsiyalar → Instagram'da ulang." },
            { status: 400 },
          );
        }

        const files: { name: string; type: string; data: Uint8Array }[] = [];
        let inline = 0;
        for (const f of rawFiles) {
          if (!f || typeof f.name !== "string") continue;
          const name = f.name.slice(0, 120) || "file";
          const type = typeof f.type === "string" && f.type ? f.type : "application/octet-stream";
          if (!attachmentTypeFor(type)) {
            return Response.json(
              { error: `Instagram'ga faqat rasm, video, audio va PDF yuboriladi (${name}).` },
              { status: 400 },
            );
          }
          let data: Uint8Array | null = null;
          if (typeof f.base64 === "string") {
            data = Uint8Array.from(Buffer.from(f.base64, "base64"));
            inline += data.byteLength;
            if (inline > MAX_INLINE_BYTES) {
              return Response.json({ error: "Fayllar 3 MB dan katta bo'lmasin." }, { status: 400 });
            }
          } else if (typeof f.path === "string") {
            data = await readBulkUpload(caller.organizationId, f.path);
          }
          if (!data) return Response.json({ error: "Fayl topilmadi." }, { status: 400 });
          files.push({ name, type, data });
        }

        const base = {
          organization_id: caller.organizationId,
          lead_id: leadId,
          direction: "out" as const,
          sent_by: caller.id,
          channel: "instagram" as const,
        };
        try {
          if (text) {
            const mid = await sendInstagramText(account.token, link.igsid, text);
            await saveOut({ ...base, text, ext_message_id: mid });
          }
          for (const f of files) {
            const type = attachmentTypeFor(f.type)!;
            const staged = await stageOutgoingFile(caller.organizationId, f);
            const mid = await sendInstagramAttachment(account.token, link.igsid, type, staged.url);
            await saveOut({
              ...base,
              text: "",
              ext_message_id: mid,
              file_kind: FILE_KIND[type],
              file_id: `${STORAGE_PREFIX}${staged.path}`,
              file_name: f.name,
            });
          }
        } catch (err) {
          return Response.json({ error: sendErrorMessage(err) }, { status: 502 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
