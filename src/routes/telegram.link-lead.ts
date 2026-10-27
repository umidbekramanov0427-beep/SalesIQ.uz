import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

const CODE_TTL_MS = 15 * 60 * 1000;

type Body = { leadId?: unknown };

// Same shape as /telegram/link and /telegram/link-group, but keyed by lead
// instead of profile/organization: a rep generates this code from the lead
// workspace and hands it to the customer (by phone, in person --
// however they're already talking), the customer sends it to the shared
// bot, and the webhook (see telegram.webhook.ts) turns that into a real
// lead_telegram_links row.
export const Route = createFileRoute("/telegram/link-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        if (!leadId) return Response.json({ error: "leadId is required" }, { status: 400 });

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

        const code = randomCode();
        const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        const { error } = await supabaseAdmin.from("lead_telegram_link_codes").upsert(
          {
            lead_id: leadId,
            organization_id: caller.organizationId,
            code,
            created_by: caller.id,
            expires_at: expiresAt,
          },
          { onConflict: "lead_id" },
        );
        if (error) return Response.json({ error: error.message }, { status: 400 });

        const { data: botSetting } = await supabaseAdmin
          .from("integration_settings")
          .select("config")
          .eq("organization_id", caller.organizationId)
          .eq("key", "telegram_bot")
          .maybeSingle();
        const config = (botSetting?.config ?? {}) as { username?: string };

        return Response.json({ code, botUsername: config.username ?? null, expiresAt });
      },
    },
  },
});
