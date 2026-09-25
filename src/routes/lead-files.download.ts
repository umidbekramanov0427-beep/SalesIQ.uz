import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { getLeadFileDownloadUrl } from "@/lib/lead-files.server";

export const Route = createFileRoute("/lead-files/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const fileId = new URL(request.url).searchParams.get("fileId");
        if (!fileId) return Response.json({ error: "fileId is required" }, { status: 400 });

        try {
          const url = await getLeadFileDownloadUrl(caller.organizationId, fileId);
          return Response.json({ url });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Havola yaratib bo'lmadi.";
          return Response.json({ error: message }, { status: 404 });
        }
      },
    },
  },
});
