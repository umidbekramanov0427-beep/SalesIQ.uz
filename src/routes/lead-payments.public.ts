import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clickReady, loadMerchant, paymeReady } from "@/lib/lead-payments/merchant.server";
import { clickCheckoutUrl, paymeCheckoutUrl } from "@/lib/lead-payments/paid-stage";

// GET /lead-payments/public?id=<link id> -- public on purpose: what the
// client's /pay page shows (company, amount, purpose, status) and the
// Payme / Click checkout addresses. The link id is a random UUID; nothing
// about the lead itself is returned.
export const Route = createFileRoute("/lead-payments/public")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(id))
          return Response.json({ error: "not_found" }, { status: 404 });
        const { data: link } = await supabaseAdmin
          .from("lead_payment_links")
          .select("id, organization_id, amount, description, status, paid_at, provider, created_at")
          .eq("id", id)
          .maybeSingle();
        if (!link) return Response.json({ error: "not_found" }, { status: 404 });
        const [{ data: org }, merchant] = await Promise.all([
          supabaseAdmin
            .from("organizations")
            .select("name")
            .eq("id", link.organization_id)
            .maybeSingle(),
          loadMerchant(link.organization_id),
        ]);
        const back = `${url.origin}/pay/${link.id}`;
        const amount = Number(link.amount);
        const open = link.status === "pending";
        return Response.json(
          {
            company: org?.name ?? "",
            amount,
            description: link.description,
            status: link.status,
            createdAt: link.created_at,
            paidAt: link.paid_at,
            provider: link.provider,
            payme:
              open && paymeReady(merchant)
                ? paymeCheckoutUrl(merchant!.paymeMerchantId!, link.id, amount, back)
                : null,
            click:
              open && clickReady(merchant)
                ? clickCheckoutUrl(
                    merchant!.clickServiceId!,
                    merchant!.clickMerchantId!,
                    link.id,
                    amount,
                    back,
                  )
                : null,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
