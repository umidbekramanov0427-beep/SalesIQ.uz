import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { fileUsage, listTrashedFiles } from "@/lib/files-housekeeping.server";

// GET /lead-files/trash -> Admin → Fayllar: the trash (restorable for 30
// days) and how much the company's files take. Super admin only; trashed
// rows are hidden from browsers by RLS, so this is the only way to them.
export const Route = createFileRoute("/lead-files/trash")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const [files, usage] = await Promise.all([
          listTrashedFiles(admin.organizationId),
          fileUsage(admin.organizationId),
        ]);
        return Response.json({ files, usage });
      },
    },
  },
});
