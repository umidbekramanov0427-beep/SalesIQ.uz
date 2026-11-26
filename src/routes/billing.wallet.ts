import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember, requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createTopupLink,
  getWallet,
  loadCatalog,
  purchaseFromBalance,
  saveLegal,
  setAutoRenew,
  walletHistory,
} from "@/lib/subscription-billing/wallet.server";

// Hisob va to'lov (5CRM style):
//   GET  /billing/wallet -> { ready, catalog, wallet, history, providers, staff }
//   POST /billing/wallet {action: "topup", provider, credit}  -> { payUrl, amount }
//                        {action: "purchase", cart}            -> { until, total }
//                        {action: "autoRenew", on}
//                        {action: "legal", legal}
// Reading is for any member (the page shows the balance); acting is for the
// company's admin. Amounts are always computed here from the owner's prices.
export const Route = createFileRoute("/billing/wallet")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireOrgMember(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const catalog = await loadCatalog();
        const [wallet, history, { data: creds }, { count }] = await Promise.all([
          getWallet(me.organizationId, catalog),
          walletHistory(me.organizationId),
          supabaseAdmin
            .from("platform_payment_credentials")
            .select("*")
            .eq("id", true)
            .maybeSingle(),
          supabaseAdmin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", me.organizationId),
        ]);
        return Response.json({
          ready: wallet.ready,
          catalog,
          wallet,
          history,
          staff: count ?? 0,
          providers: {
            payme: !!creds?.payme_merchant_id,
            click: !!(creds?.click_service_id && creds?.click_merchant_id),
            paynet: false,
          },
        });
      },
      POST: async ({ request }) => {
        const me = await requireSuperAdmin(request);
        if (!me) return Response.json({ error: "Faqat kompaniya admini" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          if (body["action"] === "topup") {
            const provider =
              body["provider"] === "click"
                ? "click"
                : body["provider"] === "payme"
                  ? "payme"
                  : null;
            if (!provider)
              return Response.json({ error: "To'lov tizimini tanlang" }, { status: 400 });
            const r = await createTopupLink(
              me.organizationId,
              me.id,
              provider,
              Number(body["credit"]),
            );
            return Response.json(r);
          }
          if (body["action"] === "purchase") {
            return Response.json(await purchaseFromBalance(me.organizationId, me.id, body["cart"]));
          }
          if (body["action"] === "autoRenew") {
            await setAutoRenew(me.organizationId, body["on"] === true);
            return Response.json({ ok: true });
          }
          if (body["action"] === "legal") {
            return Response.json({
              ok: true,
              legal: await saveLegal(me.organizationId, body["legal"]),
            });
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Xatolik" },
            { status: 400 },
          );
        }
      },
    },
  },
});
