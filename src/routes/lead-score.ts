import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { scoreLead } from "@/lib/lead-scoring.server";

// "Qayta baholash" on a lead: scores it from its chat right now.
export const Route = createFileRoute("/lead-score")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await requireOrgMember(request);
        if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { leadId?: unknown };
        if (typeof body.leadId !== "string") {
          return Response.json({ error: "leadId required" }, { status: 400 });
        }
        try {
          const result = await scoreLead(body.leadId, member.organizationId);
          if (!result) return Response.json({ error: "Not found" }, { status: 404 });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed";
          const pending = /ai_score_reason|ai_scored_at|schema cache/.test(message);
          return Response.json(
            { error: pending ? "MIGRATION_PENDING" : message },
            { status: pending ? 503 : 500 },
          );
        }
      },
    },
  },
});
