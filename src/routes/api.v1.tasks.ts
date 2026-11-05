import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApi } from "@/lib/api-keys.server";
import { apiError, loadApiLead, readJson, str } from "@/lib/api-v1.server";

const PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;

// POST /api/v1/tasks (tasks:write)
//   { lead_id, title, description?, due_date? (ISO), assignee_id?, priority? }
//   -> 201 { data: { id } }. Without assignee_id the lead's owner gets it.
export const Route = createFileRoute("/api/v1/tasks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await authenticateApi(request, "tasks:write");
        if (caller instanceof Response) return caller;
        const body = await readJson(request);
        if (!body) return apiError(400, "bad_request", "Send a JSON object.");
        const title = str(body["title"], 300);
        if (!title) return apiError(422, "invalid", "'title' is required.");
        const lead = await loadApiLead(caller.organizationId, str(body["lead_id"], 40) ?? "");
        if (!lead) return apiError(422, "invalid", "'lead_id' is not a lead of this company.");
        const due = str(body["due_date"], 40);
        if (due && Number.isNaN(Date.parse(due)))
          return apiError(422, "invalid", "'due_date' must be an ISO date.");
        let assignee = lead.owner?.id ?? null;
        const wanted = str(body["assignee_id"], 40);
        if (wanted) {
          const { data: p } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("organization_id", caller.organizationId)
            .eq("id", wanted)
            .maybeSingle();
          if (!p) return apiError(422, "invalid", "'assignee_id' is not a person of this company.");
          assignee = p.id;
        }
        const priority = PRIORITIES.find((p) => p === body["priority"]) ?? "Normal";
        const { data, error } = await supabaseAdmin
          .from("tasks")
          .insert({
            organization_id: caller.organizationId,
            lead_id: lead.id,
            title,
            description: str(body["description"], 4000),
            due_date: due ? new Date(due).toISOString() : null,
            assignee_id: assignee,
            priority,
          })
          .select("id")
          .single();
        if (error) return apiError(500, "server_error", "Could not create the task.");
        return Response.json({ data: { id: data.id } }, { status: 201 });
      },
    },
  },
});
