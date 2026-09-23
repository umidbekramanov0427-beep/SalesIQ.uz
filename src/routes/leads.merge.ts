import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { mergeLeads } from "@/lib/leads/lead-merge.server";

// Any org member can merge -- the same population that can flag a
// duplicate in the first place (lead_duplicate_flags_insert has no
// admin-only check either), since this is routine pipeline hygiene a rep
// does while working their own leads, not an account-level setting.
export const Route = createFileRoute("/leads/merge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as {
          survivorLeadId?: string;
          loserLeadId?: string;
        };
        if (!body.survivorLeadId || !body.loserLeadId) {
          return Response.json(
            { error: "survivorLeadId and loserLeadId are required." },
            { status: 400 },
          );
        }

        try {
          const result = await mergeLeads(
            caller.organizationId,
            body.survivorLeadId,
            body.loserLeadId,
          );
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Could not merge leads." },
            { status: 500 },
          );
        }
      },
    },
  },
});
