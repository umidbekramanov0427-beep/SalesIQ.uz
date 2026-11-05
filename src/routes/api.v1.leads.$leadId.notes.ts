import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApi } from "@/lib/api-keys.server";
import { apiError, loadApiLead, readJson, str } from "@/lib/api-v1.server";

// POST /api/v1/leads/<id>/notes (leads:write) { text } -> 201 { data: { id } }
// A note in the lead's history, as if typed on the lead card.
export const Route = createFileRoute("/api/v1/leads/$leadId/notes")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const caller = await authenticateApi(request, "leads:write");
        if (caller instanceof Response) return caller;
        if (!(await loadApiLead(caller.organizationId, params.leadId)))
          return apiError(404, "not_found", "No such lead.");
        const body = await readJson(request);
        const text = str(body?.["text"], 4000);
        if (!text) return apiError(422, "invalid", "'text' is required.");
        const { data, error } = await supabaseAdmin
          .from("lead_activities")
          .insert({
            organization_id: caller.organizationId,
            lead_id: params.leadId,
            type: "note",
            content: text,
          })
          .select("id")
          .single();
        if (error) return apiError(500, "server_error", "Could not add the note.");
        return Response.json({ data: { id: data.id } }, { status: 201 });
      },
    },
  },
});
