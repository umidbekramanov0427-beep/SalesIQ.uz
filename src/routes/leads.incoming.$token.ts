import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { ingestLead, mapIncomingLeadPayload } from "@/lib/leads/lead-intake.server";

// Public, unauthenticated -- hit by an external webhook sender (Zapier,
// Make, a "Facebook Lead Ads" bridge, or any custom script) with no
// Supabase session. The unguessable :token path segment (lead_sources
// .webhook_token) is what identifies the org and source, the same role
// AmoCRM's ?org= query param + subdomain check plays on that webhook.
export const Route = createFileRoute("/leads/incoming/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { token } = params;
        const { data: source } = await supabaseAdmin
          .from("lead_sources")
          .select("*")
          .eq("webhook_token", token)
          .maybeSingle();

        if (!source) {
          return Response.json({ error: "Unknown source." }, { status: 404 });
        }

        const payload = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
        const payloadJson = payload as Json;

        if (!source.active) {
          await supabaseAdmin.from("incoming_lead_log").insert({
            organization_id: source.organization_id,
            lead_source_id: source.id,
            payload: payloadJson,
            status: "failed",
            error: "Source is disabled.",
          });
          return Response.json({ error: "Source is disabled." }, { status: 403 });
        }

        try {
          const mapped = mapIncomingLeadPayload(
            payload,
            (source.field_mapping ?? {}) as Record<string, unknown>,
          );

          if (!mapped.name && !mapped.phone && !mapped.email) {
            await supabaseAdmin.from("incoming_lead_log").insert({
              organization_id: source.organization_id,
              lead_source_id: source.id,
              payload: payloadJson,
              status: "failed",
              error: "Could not find a name, phone or email in the payload.",
            });
            return Response.json({ error: "No usable lead fields found." }, { status: 422 });
          }

          const result = await ingestLead(source.organization_id, {
            name: mapped.name || mapped.phone || mapped.email || "New lead",
            phone: mapped.phone,
            email: mapped.email,
            companyName: mapped.company,
            source: source.name,
            defaultStageId: source.default_stage_id,
            defaultOwnerId: source.default_owner_id,
            duplicateSource: "webhook",
            note: mapped.message,
          });

          await supabaseAdmin.from("incoming_lead_log").insert({
            organization_id: source.organization_id,
            lead_source_id: source.id,
            payload: payloadJson,
            status: result.duplicate ? "duplicate" : "processed",
            created_lead_id: result.leadId,
          });

          return Response.json({ ok: true, leadId: result.leadId, duplicate: result.duplicate });
        } catch (err) {
          await supabaseAdmin.from("incoming_lead_log").insert({
            organization_id: source.organization_id,
            lead_source_id: source.id,
            payload: payloadJson,
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error.",
          });
          return Response.json({ error: "Internal error." }, { status: 500 });
        }
      },
    },
  },
});
