import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { signSupportUpload } from "@/lib/support-files.server";

// POST /support/upload {name, size} -> {path, token}: a one-time slot to
// upload one file for the SalesIQ support chat (the Operator tab).
export const Route = createFileRoute("/support/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as { name?: unknown; size?: unknown };
        const name = typeof b.name === "string" ? b.name : "file";
        const size = typeof b.size === "number" ? b.size : 0;
        try {
          return Response.json(await signSupportUpload(member.organizationId, name, size));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: msg }, { status: msg === "TOO_BIG" ? 413 : 500 });
        }
      },
    },
  },
});
