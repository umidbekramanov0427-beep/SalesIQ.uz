import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendTelegramFileAs,
  sendTelegramMessage,
  telegramFileKind,
  TELEGRAM_FILE_KINDS,
  type TelegramFileKind,
} from "@/lib/telegram-report.server";
import { readBulkUpload } from "@/lib/bulk-uploads.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";

// POST /telegram/send-lead-message { leadId, text?, files? } -> sends a
// message to the lead's linked Telegram chat from the lead card: text,
// and/or files (photos, documents, audio, voice, video, round video, GIF)
// -- `as` picks how a file shows (a recording as a voice note or a file,
// a video as a video, a round video or a file) -- each file either
// inline { name, type, base64 } or uploaded first through
// /bulk-message/upload { name, type, path }. Every piece is saved in the
// lead's chat history.

type Body = { leadId?: unknown; text?: unknown; files?: unknown };
type RawFile = {
  name?: unknown;
  type?: unknown;
  base64?: unknown;
  path?: unknown;
  as?: unknown;
};

const MAX_FILES = 10;
// Inline files travel in the request body (Vercel's limit is 4.5 MB).
const MAX_INLINE_BYTES = 3 * 1024 * 1024;

export const Route = createFileRoute("/telegram/send-lead-message")({
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

        const files: {
          name: string;
          type: string;
          data: Uint8Array;
          as: TelegramFileKind | null;
        }[] = [];
        let inline = 0;
        for (const f of rawFiles) {
          if (!f || typeof f.name !== "string") continue;
          const name = f.name.slice(0, 120) || "file";
          const type = typeof f.type === "string" && f.type ? f.type : "application/octet-stream";
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
          const as = TELEGRAM_FILE_KINDS.find((k) => k === f.as) ?? null;
          files.push({ name, type, data, as });
        }

        const base = {
          organization_id: caller.organizationId,
          lead_id: leadId,
          direction: "out" as const,
          sent_by: caller.id,
        };
        try {
          if (files.length === 0) {
            await sendTelegramMessage(link.chat_id, text);
            await insertLeadChatMessage({ ...base, text });
          } else {
            // One file carries the text as its caption; with several, the
            // text goes first and the files follow in order.
            const captionOnFile = files.length === 1;
            if (!captionOnFile && text) {
              await sendTelegramMessage(link.chat_id, text);
              await insertLeadChatMessage({ ...base, text });
            }
            for (const f of files) {
              const { kind, fileId } = await sendTelegramFileAs(
                link.chat_id,
                {
                  kind: f.as ?? telegramFileKind(f.type, f.name),
                  name: f.name,
                  type: f.type,
                  data: f.data,
                },
                captionOnFile ? text : "",
              );
              await insertLeadChatMessage({
                ...base,
                text: captionOnFile ? text : "",
                file_kind: kind,
                file_id: fileId,
                file_name: f.name,
              });
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not send the message.";
          return Response.json({ error: message }, { status: 502 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
