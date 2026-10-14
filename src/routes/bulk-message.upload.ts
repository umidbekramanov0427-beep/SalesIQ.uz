import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import {
  MAX_BULK_UPLOAD_BYTES,
  removeBulkUploads,
  signBulkUpload,
} from "@/lib/bulk-uploads.server";

// Big attachments of a bulk message or of a lead chat message (sending
// itself is where plan limits are checked): { action: "sign", name, size } gives a
// one-time upload slot in Storage (the browser uploads the file there
// itself, past the request size limit); { action: "remove", paths } clears
// them once the message has gone out.
export const Route = createFileRoute("/bulk-message/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as {
          action?: unknown;
          name?: unknown;
          size?: unknown;
          paths?: unknown;
        };
        if (body.action === "remove") {
          const paths = Array.isArray(body.paths)
            ? body.paths.filter((p): p is string => typeof p === "string").slice(0, 20)
            : [];
          await removeBulkUploads(caller.organizationId, paths).catch(() => {});
          return Response.json({ ok: true });
        }
        if (body.action !== "sign" || typeof body.name !== "string") {
          return Response.json({ error: "action and name are required." }, { status: 400 });
        }
        if (typeof body.size === "number" && body.size > MAX_BULK_UPLOAD_BYTES) {
          return Response.json({ error: "Fayl 20 MB dan katta bo'lmasin." }, { status: 400 });
        }
        try {
          return Response.json(await signBulkUpload(caller.organizationId, body.name));
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Upload failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
