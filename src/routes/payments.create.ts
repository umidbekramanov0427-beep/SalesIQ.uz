import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { createLeadPaymentLink, type PaymentProvider } from "@/lib/payments/payments-data.server";

type Body = { leadId?: unknown; provider?: unknown; amount?: unknown };

const PROVIDERS: PaymentProvider[] = ["payme", "click"];

export const Route = createFileRoute("/payments/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const leadId = typeof body.leadId === "string" ? body.leadId : "";
        const provider = PROVIDERS.includes(body.provider as PaymentProvider)
          ? (body.provider as PaymentProvider)
          : null;
        const amount = typeof body.amount === "number" ? body.amount : NaN;
        if (!leadId || !provider || !Number.isFinite(amount) || amount <= 0) {
          return Response.json(
            { error: "leadId, provider va musbat amount talab qilinadi." },
            { status: 400 },
          );
        }

        try {
          const result = await createLeadPaymentLink(
            caller.organizationId,
            caller.id,
            leadId,
            provider,
            amount,
          );
          return Response.json(result);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "To'lov havolasini yaratib bo'lmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
