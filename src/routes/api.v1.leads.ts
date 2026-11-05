import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApi } from "@/lib/api-keys.server";
import {
  LEAD_COLUMNS,
  apiError,
  loadApiLead,
  readJson,
  serializeLeads,
  str,
} from "@/lib/api-v1.server";
import { ingestLead } from "@/lib/leads/lead-intake.server";

// GET /api/v1/leads  (scope leads:read)
//   ?limit=1..100 (50)  &offset=0  &funnel=<name>  &updated_since=<ISO>
//   -> { data: Lead[], next_offset: number | null }, newest change first.
// POST /api/v1/leads (scope leads:write)
//   { name, phone?, email?, company?, source?, campaign?, note?, tags?[] }
//   -> 201 { data: Lead, duplicate } -- the same intake as web forms and
//   webhooks: phone cleaning, duplicate merging, distribution, automations.
export const Route = createFileRoute("/api/v1/leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await authenticateApi(request, "leads:read");
        if (caller instanceof Response) return caller;
        const url = new URL(request.url);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
        const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
        let q = supabaseAdmin
          .from("leads")
          .select(LEAD_COLUMNS)
          .eq("organization_id", caller.organizationId)
          .order("updated_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const funnel = url.searchParams.get("funnel");
        if (funnel) q = q.eq("funnel", funnel);
        const since = url.searchParams.get("updated_since");
        if (since) {
          if (Number.isNaN(Date.parse(since)))
            return apiError(400, "bad_request", "updated_since must be an ISO date.");
          q = q.gte("updated_at", new Date(since).toISOString());
        }
        const { data, error } = await q;
        if (error) return apiError(500, "server_error", "Could not read leads.");
        const rows = (data ?? []) as unknown as Parameters<typeof serializeLeads>[1];
        return Response.json({
          data: await serializeLeads(caller.organizationId, rows),
          next_offset: rows.length === limit ? offset + limit : null,
        });
      },
      POST: async ({ request }) => {
        const caller = await authenticateApi(request, "leads:write");
        if (caller instanceof Response) return caller;
        const body = await readJson(request);
        if (!body) return apiError(400, "bad_request", "Send a JSON object.");
        const name = str(body["name"], 200);
        if (!name) return apiError(422, "invalid", "'name' is required.");
        const tags = Array.isArray(body["tags"])
          ? body["tags"].filter((x): x is string => typeof x === "string").slice(0, 20)
          : undefined;
        try {
          const result = await ingestLead(caller.organizationId, {
            name,
            phone: str(body["phone"], 40),
            email: str(body["email"], 200),
            companyName: str(body["company"], 200),
            source: str(body["source"], 100) ?? "API",
            campaign: str(body["campaign"], 200),
            note: str(body["note"], 4000),
            duplicateSource: "webhook",
            ...(tags?.length ? { tags } : {}),
          });
          const lead = await loadApiLead(caller.organizationId, result.leadId);
          return Response.json(
            { data: lead, duplicate: result.duplicate },
            { status: result.duplicate ? 200 : 201 },
          );
        } catch (err) {
          console.error("[api/v1] lead create failed", err);
          return apiError(500, "server_error", "Could not create the lead.");
        }
      },
    },
  },
});
