import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import {
  sendBulkMessage,
  type BulkAttachment,
  type BulkMessageChannel,
} from "@/lib/bulk-message.server";
import { readBulkUpload } from "@/lib/bulk-uploads.server";
import { featureLockReason, phaseLockMessage } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";

type Body = {
  leadIds?: unknown;
  channel?: unknown;
  text?: unknown;
  subject?: unknown;
  /** Optional file: { name, type, base64 } (the older single-file form). */
  file?: unknown;
  /**
   * Optional files: each { name, type, base64 } (small ones, inline) or
   * { name, type, path } (uploaded first through /bulk-message/upload).
   */
  files?: unknown;
};

const CHANNELS: BulkMessageChannel[] = ["sms", "telegram", "email"];
const MAX_RECIPIENTS = 500;
// Inline files travel in the request body, which is kept small (a few MB);
// bigger ones are uploaded to Storage first.
const MAX_INLINE_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 10;

export const Route = createFileRoute("/bulk-message/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await loadOrgAccess(caller.organizationId);
        const lockReason = access ? featureLockReason(access, "bulk_messaging") : "plan";
        if (lockReason) {
          return Response.json(
            {
              error:
                lockReason === "plan"
                  ? "Ommaviy xabar yuborish sizning tarifingizga kirmaydi. Master IQ'ga o'ting."
                  : phaseLockMessage(lockReason),
            },
            { status: 403 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadIds = Array.isArray(body.leadIds)
          ? body.leadIds.filter((id): id is string => typeof id === "string")
          : [];
        const channel = CHANNELS.includes(body.channel as BulkMessageChannel)
          ? (body.channel as BulkMessageChannel)
          : null;
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const rawFiles = [
          ...(Array.isArray(body.files) ? body.files : []),
          ...(body.file ? [body.file] : []),
        ] as { name?: unknown; type?: unknown; base64?: unknown; path?: unknown }[];
        if (leadIds.length === 0 || !channel || (!text && rawFiles.length === 0)) {
          return Response.json(
            { error: "leadIds, channel and text (or a file) are required." },
            { status: 400 },
          );
        }
        if (leadIds.length > MAX_RECIPIENTS) {
          return Response.json(
            { error: `Bir martada eng ko'pi bilan ${MAX_RECIPIENTS} lidga yuborish mumkin.` },
            { status: 400 },
          );
        }
        if (rawFiles.length > 0 && channel === "sms") {
          return Response.json({ error: "SMS bilan fayl yuborib bo'lmaydi." }, { status: 400 });
        }
        if (rawFiles.length > MAX_FILES) {
          return Response.json(
            { error: `Eng ko'pi bilan ${MAX_FILES} ta fayl biriktirish mumkin.` },
            { status: 400 },
          );
        }

        const subject = typeof body.subject === "string" ? body.subject : null;
        const attachments: BulkAttachment[] = [];
        let inlineBytes = 0;
        for (const f of rawFiles) {
          if (!f || typeof f.name !== "string") continue;
          const name = f.name.slice(0, 120) || "file";
          const type = typeof f.type === "string" && f.type ? f.type : "application/octet-stream";
          let data: Uint8Array | null = null;
          if (typeof f.base64 === "string") {
            data = Uint8Array.from(Buffer.from(f.base64, "base64"));
            inlineBytes += data.byteLength;
            if (inlineBytes > MAX_INLINE_BYTES) {
              return Response.json({ error: "Fayllar 3 MB dan katta bo'lmasin." }, { status: 400 });
            }
          } else if (typeof f.path === "string") {
            data = await readBulkUpload(caller.organizationId, f.path);
            if (!data) {
              return Response.json({ error: "Yuklangan fayl topilmadi." }, { status: 400 });
            }
          }
          if (data) attachments.push({ name, type, data });
        }
        const results = await sendBulkMessage(caller.organizationId, caller.id, leadIds, channel, {
          text,
          ...(subject !== null ? { subject } : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
        });
        const sent = results.filter((r) => r.ok).length;
        return Response.json({ sent, failed: results.length - sent, results });
      },
    },
  },
});
