import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember, requireSuperAdmin } from "@/lib/auth.server";
import {
  clickReady,
  loadMerchant,
  paymeReady,
  saveMerchant,
} from "@/lib/lead-payments/merchant.server";

// The company's own Payme / Click cashbox for client payments.
// GET (any member): what is connected, the paid stage per funnel and the
// callback addresses to enter in Payme / Click -- never the keys.
// POST (Super Admin): saves ids, keys (empty string removes one, missing
// keeps it) and paid stages.
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : undefined);

export const Route = createFileRoute("/lead-payments/merchant")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const m = await loadMerchant(caller.organizationId);
        const app = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz").replace(/\/$/, "");
        return Response.json({
          paymeMerchantId: m?.paymeMerchantId ?? "",
          paymeKeySet: !!m?.paymeKey,
          paymeReady: paymeReady(m),
          clickServiceId: m?.clickServiceId ?? "",
          clickMerchantId: m?.clickMerchantId ?? "",
          clickKeySet: !!m?.clickKey,
          clickReady: clickReady(m),
          paidStages: m?.paidStages ?? {},
          paymeEndpoint: `${app}/lead-payments/payme/${caller.organizationId}`,
          clickEndpoint: `${app}/lead-payments/click/${caller.organizationId}`,
        });
      },
      POST: async ({ request }) => {
        const caller = await requireSuperAdmin(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const stagesRaw = body["paidStages"];
        let paidStages: Record<string, string> | undefined;
        if (stagesRaw && typeof stagesRaw === "object" && !Array.isArray(stagesRaw)) {
          paidStages = {};
          for (const [k, v] of Object.entries(stagesRaw as Record<string, unknown>)) {
            if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))
              paidStages[k.slice(0, 120)] = v;
          }
        }
        try {
          await saveMerchant(caller.organizationId, caller.id, {
            paymeMerchantId: str(body["paymeMerchantId"]),
            paymeKey: str(body["paymeKey"]),
            clickServiceId: str(body["clickServiceId"]),
            clickMerchantId: str(body["clickMerchantId"]),
            clickKey: str(body["clickKey"]),
            ...(paidStages ? { paidStages } : {}),
          });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Saqlab bo'lmadi" },
            { status: 500 },
          );
        }
        return Response.json({ ok: true });
      },
    },
  },
});
