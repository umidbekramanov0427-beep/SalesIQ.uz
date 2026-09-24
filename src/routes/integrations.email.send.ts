import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSmtpCredentials, logLeadEmail } from "@/lib/email/email-data.server";
import { sendSmtpEmail } from "@/lib/email/smtp-client.server";

type Body = { leadId?: unknown; to?: unknown; subject?: unknown; body?: unknown };

export const Route = createFileRoute("/integrations/email/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        const to = typeof body.to === "string" ? body.to.trim() : "";
        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const text = typeof body.body === "string" ? body.body.trim() : "";
        if (!leadId || !to || !subject || !text) {
          return Response.json(
            { error: "leadId, to, subject and body are all required." },
            { status: 400 },
          );
        }

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

        const creds = await getSmtpCredentials(caller.organizationId);
        if (!creds) {
          return Response.json(
            { error: "No email account is connected for this organization yet." },
            { status: 400 },
          );
        }

        try {
          await sendSmtpEmail(creds, { to, subject, body: text });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not send the email.";
          await logLeadEmail({
            organizationId: caller.organizationId,
            leadId,
            toEmail: to,
            subject,
            body: text,
            sentBy: caller.id,
            error: message,
          });
          return Response.json({ error: message }, { status: 502 });
        }

        await logLeadEmail({
          organizationId: caller.organizationId,
          leadId,
          toEmail: to,
          subject,
          body: text,
          sentBy: caller.id,
          error: null,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
