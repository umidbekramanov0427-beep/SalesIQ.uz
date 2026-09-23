import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { dismissDuplicateFlag } from "@/lib/leads/lead-merge.server";

export const Route = createFileRoute("/leads/duplicates/dismiss")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { flagId?: string };
        if (!body.flagId) return Response.json({ error: "flagId is required." }, { status: 400 });

        try {
          await dismissDuplicateFlag(caller.organizationId, body.flagId);
          return Response.json({ ok: true });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Could not dismiss flag." },
            { status: 500 },
          );
        }
      },
    },
  },
});
