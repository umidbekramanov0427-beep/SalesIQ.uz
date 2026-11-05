import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { restoreLeadFile } from "@/lib/files-housekeeping.server";

// POST /lead-files/restore { fileId } -> takes a file out of the trash
// (Admin → Fayllar). Super admin only.
export const Route = createFileRoute("/lead-files/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as { fileId?: unknown };
        const fileId = typeof body.fileId === "string" ? body.fileId : "";
        if (!fileId) return Response.json({ error: "fileId is required" }, { status: 400 });
        try {
          await restoreLeadFile(admin.organizationId, fileId);
          return Response.json({ ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Faylni tiklab bo'lmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
