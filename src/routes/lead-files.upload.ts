import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { uploadLeadFile } from "@/lib/lead-files.server";

export const Route = createFileRoute("/lead-files/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const form = await request.formData().catch(() => null);
        const leadId = form?.get("leadId");
        const file = form?.get("file");
        if (typeof leadId !== "string" || !leadId || !(file instanceof File)) {
          return Response.json({ error: "leadId va file talab qilinadi." }, { status: 400 });
        }

        try {
          const row = await uploadLeadFile(caller.organizationId, leadId, caller.id, file);
          return Response.json({ file: row });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Faylni yuklab bo'lmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
