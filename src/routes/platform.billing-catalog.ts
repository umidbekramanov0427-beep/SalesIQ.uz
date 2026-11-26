import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { adjustBalance, loadCatalog, saveCatalog } from "@/lib/subscription-billing/wallet.server";

// Platforma -> Sozlamalar: the Hisob va to'lov price list, and the owner's
// balance adjustment for one company (a bank transfer, a correction).
//   GET  -> BillingCatalog
//   POST {catalog}                          -> saves the price list
//   POST {action: "adjust", orgId, amount, note} -> { balance }
export const Route = createFileRoute("/platform/billing-catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        return Response.json(await loadCatalog());
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          if (body["action"] === "adjust") {
            const orgId = String(body["orgId"] ?? "");
            const amount = Number(body["amount"]);
            if (!/^[0-9a-f-]{36}$/i.test(orgId) || !Number.isFinite(amount) || amount === 0)
              return Response.json({ error: "Kompaniya va summa kerak" }, { status: 400 });
            const balance = await adjustBalance(orgId, ownerId, amount, String(body["note"] ?? ""));
            return Response.json({ balance });
          }
          return Response.json(await saveCatalog(body["catalog"]));
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
