import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApi } from "@/lib/api-keys.server";
import { apiError, loadApiLead, readJson, str } from "@/lib/api-v1.server";

// GET   /api/v1/leads/<id> (leads:read)  -> { data: Lead }
// PATCH /api/v1/leads/<id> (leads:write) { name?, budget?, stage_id?, tags?[] }
//   -> { data: Lead }. A stage from another company is refused.
export const Route = createFileRoute("/api/v1/leads/$leadId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const caller = await authenticateApi(request, "leads:read");
        if (caller instanceof Response) return caller;
        const lead = await loadApiLead(caller.organizationId, params.leadId);
        return lead ? Response.json({ data: lead }) : apiError(404, "not_found", "No such lead.");
      },
      PATCH: async ({ request, params }) => {
        const caller = await authenticateApi(request, "leads:write");
        if (caller instanceof Response) return caller;
        const current = await loadApiLead(caller.organizationId, params.leadId);
        if (!current) return apiError(404, "not_found", "No such lead.");
        const body = await readJson(request);
        if (!body) return apiError(400, "bad_request", "Send a JSON object.");
        const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
        const name = str(body["name"], 200);
        if (name) patch["name"] = name;
        if (body["budget"] !== undefined) {
          const n = Number(body["budget"]);
          if (!Number.isFinite(n) || n < 0)
            return apiError(422, "invalid", "'budget' must be a number ≥ 0.");
          patch["budget"] = n;
        }
        if (Array.isArray(body["tags"])) {
          patch["tags"] = body["tags"]
            .filter((x): x is string => typeof x === "string")
            .slice(0, 30);
        }
        if (body["stage_id"] !== undefined) {
          const stageId = str(body["stage_id"], 40);
          const { data: stage } = stageId
            ? await supabaseAdmin
                .from("pipeline_stages")
                .select("id, pipeline_name")
                .eq("organization_id", caller.organizationId)
                .eq("id", stageId)
                .maybeSingle()
            : { data: null };
          if (!stage) return apiError(422, "invalid", "'stage_id' is not a stage of this company.");
          patch["stage_id"] = stage.id;
          if (stage.pipeline_name) patch["funnel"] = stage.pipeline_name;
        }
        if (!Object.keys(patch).length)
          return apiError(
            422,
            "invalid",
            "Nothing to change: send name, budget, stage_id or tags.",
          );
        const { error } = await supabaseAdmin
          .from("leads")
          .update(patch)
          .eq("organization_id", caller.organizationId)
          .eq("id", params.leadId);
        if (error) return apiError(422, "rejected", error.message);
        return Response.json({ data: await loadApiLead(caller.organizationId, params.leadId) });
      },
    },
  },
});
