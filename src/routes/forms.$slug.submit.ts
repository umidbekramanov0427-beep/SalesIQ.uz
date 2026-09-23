import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { ingestLead } from "@/lib/leads/lead-intake.server";

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Public, unauthenticated -- posted by the /f/:slug page itself. The body
// is keyed by field kind directly ({ name, phone, email, company, message }),
// set by that same page, so no label-matching is needed here.
export const Route = createFileRoute("/forms/$slug/submit")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { data: form } = await supabaseAdmin
          .from("web_forms")
          .select("*")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!form) {
          return Response.json({ error: "Form not found." }, { status: 404 });
        }
        if (!form.active) {
          return Response.json(
            { error: "This form is no longer accepting submissions." },
            { status: 403 },
          );
        }

        const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
        const name = asStr(body["name"]);
        const phone = asStr(body["phone"]);
        const email = asStr(body["email"]);
        const company = asStr(body["company"]);
        const message = asStr(body["message"]);

        if (!name && !phone && !email) {
          return Response.json(
            { error: "Please fill in at least a name, phone or email." },
            { status: 422 },
          );
        }

        const forwardedFor = request.headers.get("x-forwarded-for");
        const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;
        const userAgent = request.headers.get("user-agent");

        try {
          const result = await ingestLead(form.organization_id, {
            name: name || phone || email || "Web form lead",
            phone,
            email,
            companyName: company,
            source: form.name,
            defaultStageId: form.default_stage_id,
            defaultOwnerId: form.default_owner_id,
            duplicateSource: "web_form",
            note: message,
          });

          await supabaseAdmin.from("web_form_submissions").insert({
            form_id: form.id,
            organization_id: form.organization_id,
            data: body as Json,
            created_lead_id: result.leadId,
            ip_address: ipAddress,
            user_agent: userAgent,
          });

          return Response.json({ ok: true, successMessage: form.success_message });
        } catch (err) {
          await supabaseAdmin.from("web_form_submissions").insert({
            form_id: form.id,
            organization_id: form.organization_id,
            data: body as Json,
            ip_address: ipAddress,
            user_agent: userAgent,
          });
          console.error("[web form submit]", err);
          return Response.json({ error: "Internal error." }, { status: 500 });
        }
      },
    },
  },
});
