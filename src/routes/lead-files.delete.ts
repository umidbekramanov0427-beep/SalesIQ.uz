import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { trashLeadFile } from "@/lib/files-housekeeping.server";

type Body = { fileId?: unknown };

export const Route = createFileRoute("/lead-files/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const fileId = typeof body.fileId === "string" ? body.fileId : "";
        if (!fileId) return Response.json({ error: "fileId is required" }, { status: 400 });

        try {
          // To the trash: restorable for 30 days (Admin → Fayllar).
          const how = await trashLeadFile(caller.organizationId, fileId, caller.id);
          return Response.json({ ok: true, how });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Faylni o'chirib bo'lmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
