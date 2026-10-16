import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { safeReturnOrigin } from "@/lib/instagram/events";
import { clickReady, loadMerchant, paymeReady } from "@/lib/lead-payments/merchant.server";
import { parseAmount } from "@/lib/lead-payments/paid-stage";

// POST /lead-payments/create { leadId, amount, description? } -> { id, url }:
// a payment link for the lead's client, paid into the company's own
// Payme / Click cashbox. The link opens /pay/<id> on the company's address.
export const Route = createFileRoute("/lead-payments/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const leadId = typeof body["leadId"] === "string" ? body["leadId"] : "";
        const amount = parseAmount(body["amount"]);
        const description =
          typeof body["description"] === "string" ? body["description"].trim().slice(0, 200) : "";
        if (!leadId || amount === null) {
          return Response.json(
            { error: "Summani 1 000 dan 100 000 000 so'mgacha kiriting." },
            { status: 400 },
          );
        }
        const merchant = await loadMerchant(caller.organizationId);
        if (!paymeReady(merchant) && !clickReady(merchant)) {
          return Response.json(
            { error: "Kompaniya kassasi ulanmagan — Admin → Mijozlardan to'lov." },
            { status: 400 },
          );
        }
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("id", leadId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!lead) return Response.json({ error: "Lid topilmadi." }, { status: 404 });

        const { data, error } = await supabaseAdmin
          .from("lead_payment_links")
          .insert({
            organization_id: caller.organizationId,
            lead_id: leadId,
            amount,
            description: description || null,
            created_by: caller.id,
          })
          .select("id")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const root = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz")
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "");
        const origin = safeReturnOrigin(request.headers.get("origin"), root);
        return Response.json({ id: data.id, url: `${origin}/pay/${data.id}` });
      },
    },
  },
});
