import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendBulkMessage,
  type BulkAttachment,
  type BulkMessageChannel,
} from "@/lib/bulk-message.server";
import { featureLockReason, phaseLockMessage } from "@/lib/org-access";
import { loadOrgAccess } from "@/lib/org-access.server";

type Body = {
  leadIds?: unknown;
  channel?: unknown;
  text?: unknown;
  subject?: unknown;
  /** Optional file: { name, type, base64 }. */
  file?: unknown;
};

const CHANNELS: BulkMessageChannel[] = ["sms", "telegram", "email"];
const MAX_RECIPIENTS = 500;
// The request body (base64) has to stay under Vercel's 4.5 MB limit.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

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
        if (leadIds.length === 0 || !channel || (!text && !body.file)) {
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

        const subject = typeof body.subject === "string" ? body.subject : null;
        let attachment: BulkAttachment | undefined;
        const f = body.file as { name?: unknown; type?: unknown; base64?: unknown } | undefined;
        if (f && typeof f.base64 === "string" && typeof f.name === "string") {
          if (channel === "sms") {
            return Response.json({ error: "SMS bilan fayl yuborib bo'lmaydi." }, { status: 400 });
          }
          const data = Uint8Array.from(Buffer.from(f.base64, "base64"));
          if (data.byteLength > MAX_FILE_BYTES) {
            return Response.json({ error: "Fayl 3 MB dan katta bo'lmasin." }, { status: 400 });
          }
          attachment = {
            name: f.name.slice(0, 120) || "file",
            type: typeof f.type === "string" && f.type ? f.type : "application/octet-stream",
            data,
          };
        }
        const results = await sendBulkMessage(caller.organizationId, caller.id, leadIds, channel, {
          text,
          ...(subject !== null ? { subject } : {}),
          ...(attachment ? { attachment } : {}),
        });
        const sent = results.filter((r) => r.ok).length;
        return Response.json({ sent, failed: results.length - sent, results });
      },
    },
  },
});
